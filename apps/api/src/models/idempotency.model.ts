import { Schema, model, type InferSchemaType } from 'mongoose';

const idempotencySchema = new Schema(
  {
    key: { type: String, required: true },
    scope: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: { type: String, required: true, enum: ['processing', 'completed'], default: 'processing' },
    statusCode: { type: Number, default: null },
    responseBody: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true }, collection: 'idempotency_keys' },
);

idempotencySchema.index({ key: 1, scope: 1 }, { unique: true });
idempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

export type IdempotencyRecord = InferSchemaType<typeof idempotencySchema>;
export const IdempotencyModel = model('IdempotencyKey', idempotencySchema);
