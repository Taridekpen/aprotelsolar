import { FULFILMENT_STATUSES, PAYMENT_STATUSES } from '@aprotel/shared';
import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const lineSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['product', 'package'] },
    productId: { type: Types.ObjectId, default: null },
    packageId: { type: Types.ObjectId, default: null },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    quantity: { type: Number, required: true },
    unitPriceKobo: { type: Number, required: true },
    lineTotalKobo: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      phone: { type: String, required: true },
    },
    delivery: {
      recipientName: { type: String, required: true },
      phone: { type: String, required: true },
      addressLine1: { type: String, required: true },
      addressLine2: { type: String, default: '' },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, default: 'Nigeria' },
      notes: { type: String, default: '' },
    },
    branchId: { type: Types.ObjectId, ref: 'Branch', required: true },
    lines: { type: [lineSchema], required: true },
    subtotalKobo: { type: Number, required: true },
    deliveryCostKobo: { type: Number, required: true },
    installationCostKobo: { type: Number, required: true },
    taxKobo: { type: Number, required: true },
    totalKobo: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    fulfilmentStatus: { type: String, enum: FULFILMENT_STATUSES, default: 'unfulfilled' },
    paymentReference: { type: String, default: '' },
    reservationExpiresAt: { type: Date, required: true },
    idempotencyKey: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'orders' },
);

orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ 'customer.email': 1, createdAt: -1 });
orderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const paymentSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    orderId: { type: Types.ObjectId, ref: 'Order', required: true, index: true },
    provider: { type: String, required: true, enum: ['development', 'paystack', 'flutterwave'] },
    amountKobo: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    status: { type: String, required: true, enum: ['pending', 'successful', 'failed', 'review'], default: 'pending' },
    authorizationUrl: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },
  },
  { timestamps: true, collection: 'payments' },
);

export type Order = InferSchemaType<typeof orderSchema>;
export type Payment = InferSchemaType<typeof paymentSchema>;
export const OrderModel = model('Order', orderSchema);
export const PaymentModel = model('Payment', paymentSchema);
