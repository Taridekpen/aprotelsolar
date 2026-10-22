import type { IncomingHttpHeaders } from 'node:http';
import type { Env } from '../config/env.js';
import { OrderModel, PaymentModel } from '../models/order.model.js';
import { AppError } from '../utils/errors.js';
import { datedCode } from '../utils/tokens.js';
import { withTransaction } from '../utils/transaction.js';
import { recordAudit } from './audit.service.js';
import { withIdempotency } from './idempotency.service.js';
import { commitOrderReservations } from './inventory.service.js';
import { createPaymentAdapter, signDevelopmentWebhook, type ChargeVerification } from './payment-adapter.js';
import { getSettings } from './settings.service.js';

export async function initializePayment(input: { orderNumber: string; email: string; idempotencyKey?: string; env: Env }) {
  return withIdempotency({
    key: input.idempotencyKey,
    scope: 'payment.initialize',
    body: { orderNumber: input.orderNumber, email: input.email },
    execute: async () => {
      const settings = await getSettings();
      if (!settings.payment.enabled) throw new AppError('UNPROCESSABLE', 'Payments are not enabled', 422);
      const order = await OrderModel.findOne({ orderNumber: input.orderNumber, 'customer.email': input.email });
      if (!order) throw new AppError('NOT_FOUND', 'Order was not found', 404);
      if (order.paymentStatus === 'paid') throw new AppError('CONFLICT', 'This order is already paid', 409);
      if (order.paymentStatus !== 'pending') throw new AppError('CONFLICT', 'This order cannot accept payment', 409);
      const existing = await PaymentModel.findOne({ orderId: order._id, status: 'pending', provider: input.env.PAYMENT_PROVIDER });
      if (existing) {
        return { statusCode: 200, body: { data: presentPayment(existing) } };
      }
      const reference = datedCode('PAY', 6);
      const adapter = createPaymentAdapter(input.env);
      const initialized = await adapter.initialize({
        reference,
        email: input.email,
        amountKobo: order.totalKobo,
        callbackUrl: `${input.env.API_PUBLIC_URL}/api/v1/payments/return?reference=${encodeURIComponent(reference)}`,
      });
      const payment = await PaymentModel.create({
        reference,
        orderId: order._id,
        provider: adapter.name,
        amountKobo: order.totalKobo,
        currency: 'NGN',
        status: 'pending',
        authorizationUrl: initialized.authorizationUrl,
      });
      return { statusCode: 201, body: { data: presentPayment(payment) } };
    },
  });
}

export async function handleWebhook(provider: string, headers: IncomingHttpHeaders, rawBody: Buffer | undefined, env: Env) {
  if (provider !== env.PAYMENT_PROVIDER) throw new AppError('NOT_FOUND', 'Payment provider was not found', 404);
  if (!rawBody) throw new AppError('VALIDATION_ERROR', 'Webhook payload is invalid', 400);
  const adapter = createPaymentAdapter(env);
  const event = adapter.parseWebhook(headers, rawBody);
  const verified = await adapter.verify(event.reference);
  await applyVerification(event.reference, event.success && verified.success, verified);
  return { received: true };
}

export async function verifyWithProvider(reference: string, email: string, env: Env) {
  if (env.PAYMENT_PROVIDER === 'development') {
    throw new AppError('UNPROCESSABLE', 'Development payments are confirmed through the signed webhook', 422);
  }
  const payment = await PaymentModel.findOne({ reference });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment was not found', 404);
  const order = await OrderModel.findById(payment.orderId);
  if (!order || order.get('customer.email') !== email) throw new AppError('NOT_FOUND', 'Payment was not found', 404);
  const verified = await createPaymentAdapter(env).verify(reference);
  await applyVerification(reference, verified.success, verified);
  const updated = await PaymentModel.findOne({ reference });
  return presentPayment(updated!);
}

export async function simulateDevelopmentPayment(reference: string, env: Env) {
  if (env.NODE_ENV === 'production' || env.PAYMENT_PROVIDER !== 'development') {
    throw new AppError('NOT_FOUND', 'Not found', 404);
  }
  const payload = Buffer.from(JSON.stringify({ event: 'charge.success', reference }));
  const signature = signDevelopmentWebhook(payload, env.DEV_PAYMENT_WEBHOOK_SECRET ?? '');
  await handleWebhook('development', { 'x-aprotel-signature': signature }, payload, env);
  const payment = await PaymentModel.findOne({ reference });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment was not found', 404);
  return presentPayment(payment);
}

export async function developmentCheckout(reference: string, env: Env) {
  if (env.NODE_ENV === 'production' || env.PAYMENT_PROVIDER !== 'development') {
    throw new AppError('NOT_FOUND', 'Not found', 404);
  }
  const payment = await PaymentModel.findOne({ reference });
  if (!payment) throw new AppError('NOT_FOUND', 'Payment was not found', 404);
  return {
    reference: payment.reference,
    status: payment.status,
    message: 'Development checkout does not collect card details. Confirm the payment with the signed development webhook.',
  };
}

async function applyVerification(reference: string, providerSuccess: boolean, verified: ChargeVerification) {
  await withTransaction(async (session) => {
    const payment = await PaymentModel.findOne({ reference }).session(session);
    if (!payment) throw new AppError('NOT_FOUND', 'Payment was not found', 404);
    if (payment.status === 'successful') return;
    const order = await OrderModel.findById(payment.orderId).session(session);
    if (!order) throw new AppError('NOT_FOUND', 'Order was not found', 404);
    if (order.paymentStatus === 'paid') return;
    if (!providerSuccess || verified.currency !== 'NGN' || verified.amountKobo !== payment.amountKobo || payment.amountKobo !== order.totalKobo) {
      payment.status = 'failed';
      payment.failureReason = 'Provider verification did not match the order amount';
      await payment.save({ session });
      return;
    }
    const committed = await commitOrderReservations(String(order._id), session);
    if (!committed) {
      payment.status = 'review';
      payment.failureReason = 'Payment was verified but the stock reservation was no longer available';
      order.paymentStatus = 'review';
      await payment.save({ session });
      await order.save({ session });
      await recordAudit({ action: 'payment.review', resourceType: 'payment', resourceId: reference, metadata: { orderId: String(order._id) } });
      return;
    }
    payment.status = 'successful';
    payment.verifiedAt = new Date();
    order.paymentStatus = 'paid';
    order.paymentReference = payment.reference;
    await payment.save({ session });
    await order.save({ session });
    await recordAudit({ action: 'payment.confirmed', resourceType: 'payment', resourceId: reference, metadata: { orderId: String(order._id) } });
  });
}

function presentPayment(payment: {
  reference: string;
  provider: string;
  amountKobo: number;
  currency: string;
  status: string;
  authorizationUrl?: string;
  orderId: { toString(): string };
}) {
  return {
    reference: payment.reference,
    provider: payment.provider,
    amount: (payment.amountKobo / 100).toFixed(2),
    currency: payment.currency,
    status: payment.status,
    authorizationUrl: payment.authorizationUrl ?? '',
    orderId: String(payment.orderId),
  };
}
