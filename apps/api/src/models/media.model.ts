import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const variantSchema = new Schema(
  {
    name: { type: String, required: true, enum: ['thumbnail', 'medium'] },
    gridfsFileId: { type: Types.ObjectId, required: true },
    mimeType: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

const usageSchema = new Schema(
  {
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    field: { type: String, required: true },
  },
  { _id: false },
);

const mediaSchema = new Schema(
  {
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    gridfsFileId: { type: Types.ObjectId, required: true },
    variants: { type: [variantSchema], default: [] },
    altText: { type: String, default: '' },
    uploadedBy: { type: Types.ObjectId, ref: 'Administrator', required: true },
    status: { type: String, enum: ['pending', 'attached'], default: 'pending' },
    usage: { type: [usageSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: true }, collection: 'media_assets' },
);

mediaSchema.index({ status: 1, createdAt: 1 });
mediaSchema.index({ 'usage.resourceType': 1, 'usage.resourceId': 1 });

export type MediaAsset = InferSchemaType<typeof mediaSchema>;
export const MediaAssetModel = model('MediaAsset', mediaSchema);
