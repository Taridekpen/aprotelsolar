import { PACKAGE_AVAILABILITY, PUBLICATION_STATUSES } from '@aprotel/shared';
import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const packageItemSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const solarPackageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    imageIds: { type: [Types.ObjectId], ref: 'MediaAsset', default: [] },
    items: { type: [packageItemSchema], required: true },
    estimatedCapacityKw: { type: Number, required: true },
    inverterSummary: { type: String, required: true },
    batteryCapacityKwh: { type: Number, required: true },
    solarPanelCapacityKw: { type: Number, required: true },
    runtimeAssumptions: {
      loadWatts: { type: Number, required: true },
      estimatedRuntimeHours: { type: Number, default: null },
      operatingNotes: { type: String, required: true },
    },
    priceKobo: { type: Number, required: true, min: 0 },
    installationChargeKobo: { type: Number, required: true, min: 0 },
    warranty: { type: String, default: '' },
    availability: { type: String, enum: PACKAGE_AVAILABILITY, default: 'available' },
    publicationStatus: { type: String, enum: PUBLICATION_STATUSES, default: 'draft' },
  },
  { timestamps: true, collection: 'solar_packages' },
);

solarPackageSchema.index({ publicationStatus: 1, createdAt: -1 });

export type SolarPackage = InferSchemaType<typeof solarPackageSchema>;
export const SolarPackageModel = model('SolarPackage', solarPackageSchema);
