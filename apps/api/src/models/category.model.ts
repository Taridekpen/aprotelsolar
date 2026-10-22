import { PUBLICATION_STATUSES, SPECIFICATION_PROFILES } from '@aprotel/shared';
import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    imageId: { type: Types.ObjectId, ref: 'MediaAsset', default: null },
    parentId: { type: Types.ObjectId, ref: 'Category', default: null },
    specificationProfile: { type: String, required: true, enum: SPECIFICATION_PROFILES },
    displayOrder: { type: Number, default: 0 },
    publicationStatus: { type: String, enum: PUBLICATION_STATUSES, default: 'draft' },
  },
  { timestamps: true, collection: 'categories' },
);

categorySchema.index({ parentId: 1, displayOrder: 1 });
categorySchema.index({ publicationStatus: 1, displayOrder: 1 });

export type Category = InferSchemaType<typeof categorySchema>;
export const CategoryModel = model('Category', categorySchema);
