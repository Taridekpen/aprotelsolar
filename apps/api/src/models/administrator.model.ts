import { ACCOUNT_STATUSES, PERMISSIONS, ROLES } from '@aprotel/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

const administratorSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ROLES },
    permissionsRestricted: { type: Boolean, default: false },
    permissionOverrides: { type: [String], enum: PERMISSIONS, default: undefined },
    status: { type: String, required: true, enum: ACCOUNT_STATUSES, default: 'active' },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, collection: 'administrators' },
);

administratorSchema.index({ role: 1, status: 1 });

export type Administrator = InferSchemaType<typeof administratorSchema>;
export const AdministratorModel = model('Administrator', administratorSchema);
