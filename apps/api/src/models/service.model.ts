import { PUBLICATION_STATUSES, SERVICE_AVAILABILITY } from '@aprotel/shared';
import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const serviceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    imageIds: { type: [Types.ObjectId], ref: 'MediaAsset', default: [] },
    features: { type: [String], default: [] },
    startingPriceKobo: { type: Number, default: null, min: 0 },
    availability: { type: String, enum: SERVICE_AVAILABILITY, default: 'available' },
    relatedProductIds: { type: [Types.ObjectId], ref: 'Product', default: [] },
    displayOrder: { type: Number, default: 0 },
    publicationStatus: { type: String, enum: PUBLICATION_STATUSES, default: 'draft' },
  },
  { timestamps: true, collection: 'services' },
);

serviceSchema.index({ publicationStatus: 1, displayOrder: 1 });

export type Service = InferSchemaType<typeof serviceSchema>;
export const ServiceModel = model('Service', serviceSchema);
