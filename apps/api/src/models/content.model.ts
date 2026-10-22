import { CONTENT_TYPES, PUBLICATION_STATUSES } from '@aprotel/shared';
import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const contentSchema = new Schema(
  {
    type: { type: String, required: true, enum: CONTENT_TYPES },
    slug: { type: String, required: true },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    body: { type: Schema.Types.Mixed, required: true },
    imageIds: { type: [Types.ObjectId], ref: 'MediaAsset', default: [] },
    displayOrder: { type: Number, default: 0 },
    publicationStatus: { type: String, enum: PUBLICATION_STATUSES, default: 'draft' },
    seo: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'content_entries' },
);

contentSchema.index({ type: 1, slug: 1 }, { unique: true });
contentSchema.index({ type: 1, publicationStatus: 1, displayOrder: 1 });

export type ContentEntry = InferSchemaType<typeof contentSchema>;
export const ContentEntryModel = model('ContentEntry', contentSchema);
