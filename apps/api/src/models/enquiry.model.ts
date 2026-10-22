import { ENQUIRY_STATUSES, ENQUIRY_TYPES } from '@aprotel/shared';
import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const noteSchema = new Schema(
  {
    body: { type: String, required: true },
    authorId: { type: Types.ObjectId, ref: 'Administrator', required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const enquirySchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, required: true },
    location: { type: String, required: true },
    enquiryType: { type: String, required: true, enum: ENQUIRY_TYPES },
    message: { type: String, required: true },
    productIds: { type: [Types.ObjectId], ref: 'Product', default: [] },
    solarCalculation: { type: Schema.Types.Mixed, default: null },
    recommendationSnapshot: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ENQUIRY_STATUSES, default: 'new' },
    internalNotes: { type: [noteSchema], default: [] },
    assignedTo: { type: Types.ObjectId, ref: 'Administrator', default: null },
  },
  { timestamps: true, collection: 'enquiries' },
);

enquirySchema.index({ status: 1, createdAt: -1 });
enquirySchema.index({ email: 1, createdAt: -1 });

export type Enquiry = InferSchemaType<typeof enquirySchema>;
export const EnquiryModel = model('Enquiry', enquirySchema);
