import { createHmac } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { formatKoboAsNaira } from '@aprotel/shared';
import type { Env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { PaymentModel } from '../models/order.model.js';
import { AppError } from '../utils/errors.js';
import { safeEqual } from '../utils/tokens.js';

export interface ChargeVerification {
  reference: string;
  amountKobo: number;
  currency: string;
  success: boolean;
}

export interface PaymentAdapter {
  name: Env['PAYMENT_PROVIDER'];
  initialize(input: { reference: string; email: string; amountKobo: number; callbackUrl: string }): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<ChargeVerification>;
  parseWebhook(headers: IncomingHttpHeaders, rawBody: Buffer): { reference: string; success: boolean };
}

export function createPaymentAdapter(env: Env): PaymentAdapter {
  if (env.PAYMENT_PROVIDER === 'paystack') return paystackAdapter(env);
  if (env.PAYMENT_PROVIDER === 'flutterwave') return flutterwaveAdapter(env);
  if (env.PAYMENT_PROVIDER === 'none') {
    throw new AppError('PAYMENT_DISABLED', 'Online payment is not enabled on this server', 503);
  }
  return developmentAdapter(env);
}

function developmentAdapter(env: Env): PaymentAdapter {
  const secret = env.DEV_PAYMENT_WEBHOOK_SECRET ?? '';
  return {
    name: 'development',
    async initialize(input) {
      return { authorizationUrl: `${env.API_PUBLIC_URL}/api/v1/payments/dev/checkout/${encodeURIComponent(input.reference)}` };
    },
    async verify(reference) {
      const payment = await PaymentModel.findOne({ reference });
      if (!payment) throw new AppError('NOT_FOUND', 'Payment was not found', 404);
      return {
        reference,
        amountKobo: payment.amountKobo,
        currency: payment.currency,
        success: payment.status !== 'failed',
      };
    },
    parseWebhook(headers, rawBody) {
      assertHmac(headers, 'x-aprotel-signature', rawBody, secret, 'sha256');
      const body = parseJson(rawBody);
      if (typeof body.reference !== 'string') throw new AppError('VALIDATION_ERROR', 'Webhook payload is invalid', 400);
      return { reference: body.reference, success: body.event === 'charge.success' };
    },
  };
}

function paystackAdapter(env: Env): PaymentAdapter {
  const secret = env.PAYSTACK_SECRET_KEY ?? '';
  return {
    name: 'paystack',
    async initialize(input) {
      const payload = await paystackRequest(secret, '/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo,
          reference: input.reference,
          currency: 'NGN',
          callback_url: input.callbackUrl,
        }),
      });
      const url = nestedString(payload, ['data', 'authorization_url']);
      if (!url) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Paystack did not return a checkout URL', 502);
      return { authorizationUrl: url };
    },
    async verify(reference) {
      const payload = await paystackRequest(secret, `/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
      const amount = nestedNumber(payload, ['data', 'amount']);
      const currency = nestedString(payload, ['data', 'currency']);
      const status = nestedString(payload, ['data', 'status']);
      const confirmedReference = nestedString(payload, ['data', 'reference']) ?? reference;
      if (amount == null || !currency) throw new AppError('PAYMENT_NOT_CONFIRMED', 'Paystack verification response was incomplete', 502);
      return { reference: confirmedReference, amountKobo: amount, currency, success: status === 'success' };
    },
    parseWebhook(headers, rawBody) {
      assertHmac(headers, 'x-paystack-signature', rawBody, secret, 'sha512');
      const body = parseJson(rawBody);
      const data = body.data;
      const reference = data && typeof data === 'object' && 'reference' in data ? String(data.reference) : '';
      if (!reference) throw new AppError('VALIDATION_ERROR', 'Webhook payload is invalid', 400);
      return { reference, success: body.event === 'charge.success' };
    },
  };
}

function flutterwaveAdapter(env: Env): PaymentAdapter {
  const secret = env.FLUTTERWAVE_SECRET_KEY ?? '';
  const hash = env.FLUTTERWAVE_WEBHOOK_HASH ?? '';
  return {
    name: 'flutterwave',
    async initialize(input) {
      const response = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_ref: input.reference,
          amount: Number(formatKoboAsNaira(input.amountKobo)),
          currency: 'NGN',
          redirect_url: input.callbackUrl,
          customer: { email: input.email },
        }),
      });
      const payload = await readProviderJson(response, 'Flutterwave');
      const url = nestedString(payload, ['data', 'link']);
      if (!url) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Flutterwave did not return a checkout URL', 502);
      return { authorizationUrl: url };
    },
    async verify(reference) {
      const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const payload = await readProviderJson(response, 'Flutterwave');
      const amount = nestedNumber(payload, ['data', 'amount']);
      const currency = nestedString(payload, ['data', 'currency']);
      const status = nestedString(payload, ['data', 'status']);
      if (amount == null || !currency) throw new AppError('PAYMENT_NOT_CONFIRMED', 'Flutterwave verification response was incomplete', 502);
      return { reference, amountKobo: Math.round(amount * 100), currency, success: status === 'successful' };
    },
    parseWebhook(headers, rawBody) {
      const provided = headerValue(headers, 'verif-hash');
      if (!provided || !safeEqual(provided, hash)) {
        throw new AppError('PAYMENT_NOT_CONFIRMED', 'Invalid payment signature', 401);
      }
      const body = parseJson(rawBody);
      const data = body.data;
      const reference = data && typeof data === 'object' && 'tx_ref' in data ? String(data.tx_ref) : '';
      const status = data && typeof data === 'object' && 'status' in data ? String(data.status) : '';
      if (!reference) throw new AppError('VALIDATION_ERROR', 'Webhook payload is invalid', 400);
      return { reference, success: body.event === 'charge.completed' && status === 'successful' };
    },
  };
}

export function signDevelopmentWebhook(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function assertHmac(headers: IncomingHttpHeaders, headerName: string, rawBody: Buffer, secret: string, algorithm: 'sha256' | 'sha512') {
  const provided = headerValue(headers, headerName);
  const digest = createHmac(algorithm, secret).update(rawBody).digest('hex');
  if (!provided || !safeEqual(provided, digest)) {
    throw new AppError('PAYMENT_NOT_CONFIRMED', 'Invalid payment signature', 401);
  }
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function parseJson(rawBody: Buffer): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Webhook payload is invalid', 400);
  }
}

async function paystackRequest(secret: string, path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return readProviderJson(response, 'Paystack');
}

async function readProviderJson(response: Response, provider: string): Promise<Record<string, unknown>> {
  if (!response.ok) {
    logger.error({ provider, status: response.status }, 'Payment provider request failed');
    throw new AppError('PAYMENT_PROVIDER_ERROR', `${provider} could not complete the request`, 502);
  }
  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') throw new AppError('PAYMENT_PROVIDER_ERROR', `${provider} returned an unexpected response`, 502);
  return payload as Record<string, unknown>;
}

function nestedString(payload: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : null;
}

function nestedNumber(payload: Record<string, unknown>, path: string[]): number | null {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' ? current : null;
}
