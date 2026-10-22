import { PRODUCT_AVAILABILITY, PUBLICATION_STATUSES, SPECIFICATION_PROFILES } from '@aprotel/shared';
import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const productSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    sku: { type: String, required: true, unique: true },
    brand: { type: String, required: true, trim: true },
    categoryId: { type: Types.ObjectId, ref: 'Category', required: true, index: true },
    subcategoryId: { type: Types.ObjectId, ref: 'Category', default: null },
    description: { type: String, required: true },
    shortDescription: { type: String, required: true },
    sellingPriceKobo: { type: Number, required: true, min: 0 },
    compareAtPriceKobo: { type: Number, default: null, min: 0 },
    costPriceKobo: { type: Number, required: true, min: 0, default: 0 },
    inventoryQuantity: { type: Number, required: true, default: 0, min: 0 },
    imageIds: { type: [Types.ObjectId], ref: 'MediaAsset', default: [] },
    specifications: { type: Schema.Types.Mixed, required: true },
    specificationProfile: { type: String, required: true, enum: SPECIFICATION_PROFILES },
    specificationsVerified: { type: Boolean, default: false },
    warranty: { type: String, default: '' },
    installationRequirements: { type: String, default: '' },
    availability: { type: String, enum: PRODUCT_AVAILABILITY, default: 'out_of_stock' },
    featured: { type: Boolean, default: false },
    publicationStatus: { type: String, enum: PUBLICATION_STATUSES, default: 'draft' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'products' },
);

productSchema.index({ publicationStatus: 1, featured: 1, createdAt: -1 });
productSchema.index({ brand: 1, publicationStatus: 1 });
productSchema.index({ name: 1 });
productSchema.index({ deletedAt: 1, publicationStatus: 1 });

export type Product = InferSchemaType<typeof productSchema>;
export const ProductModel = model('Product', productSchema);
