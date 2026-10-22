import { passwordSchema, resolvePermissions, type Permission, type Role } from '@aprotel/shared';
import type { Env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AdministratorModel } from '../models/administrator.model.js';
import { SessionModel } from '../models/session.model.js';
import { LoginAttemptModel, PasswordResetModel } from '../models/security.model.js';
import { AppError } from '../utils/errors.js';
import { pageMeta } from '../utils/pagination.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { randomToken, sha256 } from '../utils/tokens.js';
import { recordAudit } from './audit.service.js';
import { createMailer } from './mailer.js';

export async function login(input: { email: string; password: string; ipAddress: string; userAgent: string; env: Env }) {
  const key = `email:${input.email}`;
  const attempt = await LoginAttemptModel.findOne({ key });
  if (attempt?.lockedUntil && attempt.lockedUntil.getTime() > Date.now()) {
    throw new AppError('ACCOUNT_LOCKED', 'Too many sign-in attempts. Try again later.', 429);
  }

  const administrator = await AdministratorModel.findOne({ email: input.email }).select('+passwordHash');
  const passwordHash = administrator?.passwordHash ?? (await dummyPasswordHash(input.env));
  const passwordMatches = await verifyPassword(passwordHash, input.password);
  const active = administrator?.status === 'active';

  if (!administrator || !passwordMatches || !active) {
    await registerFailure(key, input.env);
    await recordAudit({
      actorId: administrator ? String(administrator._id) : null,
      action: 'auth.login_failed',
      resourceType: 'administrator',
      resourceId: administrator ? String(administrator._id) : '',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { email: input.email, reason: !administrator ? 'unknown' : !active ? 'inactive' : 'password' },
    });
    throw new AppError('UNAUTHORIZED', 'Email or password is incorrect', 401);
  }

  await LoginAttemptModel.deleteOne({ key });
  administrator.lastLoginAt = new Date();
  await administrator.save();

  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const session = await SessionModel.create({
    administratorId: administrator._id,
    tokenHash: sha256(sessionToken),
    csrfToken,
    expiresAt: new Date(Date.now() + input.env.SESSION_TTL_HOURS * 60 * 60 * 1000),
    idleExpiresAt: new Date(Date.now() + input.env.SESSION_IDLE_MINUTES * 60 * 1000),
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  await recordAudit({
    actorId: String(administrator._id),
    action: 'auth.login',
    resourceType: 'session',
    resourceId: String(session._id),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return { sessionToken, csrfToken, administrator: presentAdministrator(administrator) };
}

export async function logout(sessionId: string, actorId: string, meta: { ipAddress?: string; userAgent?: string }) {
  await SessionModel.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await recordAudit({
    actorId,
    action: 'auth.logout',
    resourceType: 'session',
    resourceId: sessionId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function currentCsrf(sessionId: string): Promise<string> {
  const session = await SessionModel.findById(sessionId);
  if (!session || session.revokedAt) throw new AppError('UNAUTHORIZED', 'Authentication is required', 401);
  return session.csrfToken;
}

export async function requestPasswordReset(email: string, env: Env) {
  const administrator = await AdministratorModel.findOne({ email, status: 'active' });
  if (administrator) {
    const token = randomToken();
    await PasswordResetModel.create({
      administratorId: administrator._id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
    });
    const resetUrl = `${env.PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await createMailer(env).sendPasswordReset(administrator.email, resetUrl);
    await recordAudit({
      actorId: String(administrator._id),
      action: 'auth.password_reset_requested',
      resourceType: 'administrator',
      resourceId: String(administrator._id),
    });
  }
  return { message: 'If an account exists for that email, a reset link has been sent.' };
}

export async function resetPassword(token: string, password: string, env: Env) {
  const record = await PasswordResetModel.findOne({
    tokenHash: sha256(token),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!record) throw new AppError('INVALID_TOKEN', 'Reset token is invalid or has expired', 400);
  const administrator = await AdministratorModel.findById(record.administratorId).select('+passwordHash');
  if (!administrator || administrator.status !== 'active') {
    throw new AppError('INVALID_TOKEN', 'Reset token is invalid or has expired', 400);
  }
  administrator.passwordHash = await hashPassword(password, env);
  administrator.passwordChangedAt = new Date();
  await administrator.save();
  record.usedAt = new Date();
  await record.save();
  await revokeSessions(String(administrator._id));
  await recordAudit({
    actorId: String(administrator._id),
    action: 'auth.password_reset',
    resourceType: 'administrator',
    resourceId: String(administrator._id),
  });
}

export async function changePassword(input: { administratorId: string; currentPassword: string; newPassword: string; env: Env }) {
  const administrator = await AdministratorModel.findById(input.administratorId).select('+passwordHash');
  if (!administrator) throw new AppError('UNAUTHORIZED', 'Authentication is required', 401);
  const matches = await verifyPassword(administrator.passwordHash, input.currentPassword);
  if (!matches) throw new AppError('UNAUTHORIZED', 'Current password is incorrect', 401);
  administrator.passwordHash = await hashPassword(input.newPassword, input.env);
  administrator.passwordChangedAt = new Date();
  await administrator.save();
  await revokeSessions(String(administrator._id));
  await recordAudit({
    actorId: String(administrator._id),
    action: 'auth.password_changed',
    resourceType: 'administrator',
    resourceId: String(administrator._id),
  });
}

export async function listAdministrators(query: { page: number; pageSize: number }) {
  const [items, total] = await Promise.all([
    AdministratorModel.find()
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    AdministratorModel.countDocuments(),
  ]);
  return { items: items.map(presentAdministrator), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function createAdministrator(
  input: {
    fullName: string;
    email: string;
    password: string;
    role: Role;
    permissionOverrides?: Permission[] | null;
  },
  actorId: string,
  env: Env,
) {
  const existing = await AdministratorModel.findOne({ email: input.email });
  if (existing) throw new AppError('CONFLICT', 'An administrator with that email already exists', 409);
  const restricted = input.permissionOverrides != null;
  const administrator = await AdministratorModel.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await hashPassword(input.password, env),
    role: input.role,
    permissionsRestricted: restricted,
    permissionOverrides: restricted ? input.permissionOverrides : undefined,
    status: 'active',
  });
  await recordAudit({
    actorId,
    action: 'administrator.create',
    resourceType: 'administrator',
    resourceId: String(administrator._id),
    metadata: { role: input.role },
  });
  return presentAdministrator(administrator);
}

export async function updateAdministrator(
  id: string,
  patch: { fullName?: string; role?: Role; status?: 'active' | 'suspended' | 'disabled'; permissionOverrides?: Permission[] | null },
  actor: { id: string; role: Role },
) {
  if (actor.id === id && (patch.role || (patch.status && patch.status !== 'active'))) {
    throw new AppError('FORBIDDEN', 'You cannot change your own role or disable your own account', 403);
  }
  const administrator = await AdministratorModel.findById(id);
  if (!administrator) throw new AppError('NOT_FOUND', 'Administrator was not found', 404);
  if (administrator.role === 'super_administrator' && (patch.role && patch.role !== 'super_administrator' || (patch.status && patch.status !== 'active'))) {
    await assertAnotherActiveSuper(id);
  }
  if (patch.fullName) administrator.fullName = patch.fullName;
  if (patch.role) administrator.role = patch.role;
  if (patch.status) administrator.status = patch.status;
  if (patch.permissionOverrides !== undefined) {
    administrator.permissionsRestricted = patch.permissionOverrides != null;
    administrator.permissionOverrides = patch.permissionOverrides ?? [];
  }
  await administrator.save();
  if (patch.status && patch.status !== 'active') await revokeSessions(id);
  if (patch.role) await revokeSessions(id);
  await recordAudit({
    actorId: actor.id,
    action: 'administrator.update',
    resourceType: 'administrator',
    resourceId: id,
    metadata: { role: patch.role, status: patch.status },
  });
  return presentAdministrator(administrator);
}

export async function ensureBootstrapAdmin(env: Env): Promise<{ created: boolean }> {
  if (!env.BOOTSTRAP_ADMIN_EMAIL && !env.BOOTSTRAP_ADMIN_PASSWORD && !env.BOOTSTRAP_ADMIN_NAME) {
    logger.info('Super administrator bootstrap skipped');
    return { created: false };
  }
  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error('Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or leave both empty');
  }
  const password = passwordSchema.safeParse(env.BOOTSTRAP_ADMIN_PASSWORD);
  if (!password.success) {
    throw new Error(`Bootstrap password does not meet the password policy: ${password.error.issues.map((issue) => issue.message).join(' ')}`);
  }
  const existingSuper = await AdministratorModel.exists({ role: 'super_administrator' });
  if (existingSuper) {
    logger.info('Super administrator already exists; bootstrap password was not changed');
    return { created: false };
  }
  const email = env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const existingEmail = await AdministratorModel.exists({ email });
  if (existingEmail) {
    throw new Error('Bootstrap email already belongs to a non-super administrator');
  }
  await AdministratorModel.create({
    fullName: env.BOOTSTRAP_ADMIN_NAME ?? 'Super Administrator',
    email,
    passwordHash: await hashPassword(password.data, env),
    role: 'super_administrator',
    status: 'active',
  });
  logger.info({ email }, 'Super administrator created from bootstrap configuration');
  return { created: true };
}

export function presentAdministrator(administrator: {
  _id: { toString(): string };
  fullName: string;
  email: string;
  role: string;
  status: string;
  permissionsRestricted?: boolean;
  permissionOverrides?: string[] | null;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const role = administrator.role as Role;
  const overrides = administrator.permissionsRestricted ? (administrator.permissionOverrides ?? []) : null;
  return {
    id: String(administrator._id),
    fullName: administrator.fullName,
    email: administrator.email,
    role,
    status: administrator.status,
    permissionsRestricted: Boolean(administrator.permissionsRestricted),
    permissionOverrides: administrator.permissionOverrides ?? [],
    effectivePermissions: resolvePermissions(role, overrides),
    lastLoginAt: administrator.lastLoginAt ?? null,
    createdAt: administrator.createdAt,
    updatedAt: administrator.updatedAt,
  };
}

async function registerFailure(key: string, env: Env) {
  const windowMs = env.LOGIN_LOCK_MINUTES * 60 * 1000;
  const attempt = await LoginAttemptModel.findOne({ key });
  if (!attempt || Date.now() - attempt.windowStartedAt.getTime() > windowMs) {
    await LoginAttemptModel.updateOne(
      { key },
      { $set: { failures: 1, windowStartedAt: new Date(), lockedUntil: null } },
      { upsert: true },
    );
    return;
  }
  const failures = attempt.failures + 1;
  await LoginAttemptModel.updateOne(
    { key },
    { $set: { failures, lockedUntil: failures >= env.LOGIN_MAX_ATTEMPTS ? new Date(Date.now() + windowMs) : null } },
  );
}

async function assertAnotherActiveSuper(excludingId: string) {
  const others = await AdministratorModel.countDocuments({
    _id: { $ne: excludingId },
    role: 'super_administrator',
    status: 'active',
  });
  if (others === 0) {
    throw new AppError('LAST_SUPER_ADMIN', 'The last active super administrator cannot be removed', 409);
  }
}

async function revokeSessions(administratorId: string) {
  await SessionModel.updateMany({ administratorId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

let cachedDummyHash: string | null = null;

async function dummyPasswordHash(env: Env): Promise<string> {
  if (!cachedDummyHash) cachedDummyHash = await hashPassword('not-a-real-account-password', env);
  return cachedDummyHash;
}
