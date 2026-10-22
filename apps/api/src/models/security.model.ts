import { Schema, Types, model, type InferSchemaType } from 'mongoose';

const loginAttemptSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    failures: { type: Number, required: true, default: 0 },
    windowStartedAt: { type: Date, required: true },
    lockedUntil: { type: Date, default: null },
  },
  { collection: 'login_attempts' },
);

const passwordResetSchema = new Schema(
  {
    administratorId: { type: Types.ObjectId, ref: 'Administrator', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'password_reset_tokens' },
);

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const auditLogSchema = new Schema(
  {
    actorId: { type: Types.ObjectId, ref: 'Administrator', default: null },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export type LoginAttempt = InferSchemaType<typeof loginAttemptSchema>;
export type PasswordResetToken = InferSchemaType<typeof passwordResetSchema>;
export type AuditLog = InferSchemaType<typeof auditLogSchema>;

export const LoginAttemptModel = model('LoginAttempt', loginAttemptSchema);
export const PasswordResetModel = model('PasswordResetToken', passwordResetSchema);
export const AuditLogModel = model('AuditLog', auditLogSchema);
