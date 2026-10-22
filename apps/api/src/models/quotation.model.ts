import { ENGINEERING_APPROVALS, QUOTATION_STATUSES } from '@aprotel/shared';
import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const lineSchema = new Schema(
  {
    productId: { type: Types.ObjectId, required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPriceKobo: { type: Number, required: true },
    lineTotalKobo: { type: Number, required: true },
    specificationsSnapshot: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const packageLineSchema = new Schema(
  {
    packageId: { type: Types.ObjectId, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPriceKobo: { type: Number, required: true },
    lineTotalKobo: { type: Number, required: true },
    installationChargeKobo: { type: Number, required: true },
    components: { type: [lineSchema], default: [] },
    pricingBasis: { type: String, default: 'package_price' },
  },
  { _id: false },
);

const revisionSchema = new Schema(
  {
    reason: { type: String, required: true },
    actorId: { type: Types.ObjectId, required: true },
    createdAt: { type: Date, default: () => new Date() },
    lines: { type: [lineSchema], default: [] },
    packageLines: { type: [packageLineSchema], default: [] },
    installationCostKobo: { type: Number, required: true },
    deliveryCostKobo: { type: Number, required: true },
    taxKobo: { type: Number, required: true },
    subtotalKobo: { type: Number, required: true },
    totalKobo: { type: Number, required: true },
  },
  { _id: false },
);

const noteSchema = new Schema(
  {
    body: { type: String, required: true },
    authorId: { type: Types.ObjectId, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const quotationSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      phone: { type: String, required: true },
      location: { type: String, default: '' },
    },
    applianceSnapshot: { type: Schema.Types.Mixed, required: true },
    lines: { type: [lineSchema], default: [] },
    packageLines: { type: [packageLineSchema], default: [] },
    installationCostKobo: { type: Number, required: true },
    deliveryCostKobo: { type: Number, required: true },
    taxKobo: { type: Number, required: true },
    subtotalKobo: { type: Number, required: true },
    totalKobo: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    status: { type: String, enum: QUOTATION_STATUSES, default: 'submitted' },
    engineeringApproval: { type: String, enum: ENGINEERING_APPROVALS, default: 'pending' },
    approvedBy: { type: Types.ObjectId, ref: 'Administrator', default: null },
    approvedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    internalNotes: { type: [noteSchema], default: [] },
    commercialRevisions: { type: [revisionSchema], default: [] },
  },
  { timestamps: true, collection: 'quotations' },
);

quotationSchema.index({ status: 1, createdAt: -1 });
quotationSchema.index({ 'customer.email': 1 });
quotationSchema.index({ engineeringApproval: 1, status: 1 });

export type Quotation = InferSchemaType<typeof quotationSchema>;
export const QuotationModel = model('Quotation', quotationSchema);
