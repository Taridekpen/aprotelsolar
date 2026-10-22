import { BRANCH_STATUSES } from '@aprotel/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

const branchSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: 'Nigeria' },
    postalCode: { type: String, default: '' },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    isCentral: { type: Boolean, default: false },
    status: { type: String, enum: BRANCH_STATUSES, default: 'active' },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'branches' },
);

branchSchema.index({ status: 1, displayOrder: 1 });
branchSchema.index({ isCentral: 1 });

export type Branch = InferSchemaType<typeof branchSchema>;
export const BranchModel = model('Branch', branchSchema);
