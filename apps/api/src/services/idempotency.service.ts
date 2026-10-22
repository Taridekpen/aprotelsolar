import { IdempotencyModel } from '../models/idempotency.model.js';
import { AppError } from '../utils/errors.js';
import { isDuplicateKey } from '../utils/object-id.js';
import { sha256 } from '../utils/tokens.js';

export async function withIdempotency<T>(options: {
  key: string | undefined;
  scope: string;
  body: unknown;
  execute: () => Promise<{ statusCode: number; body: T }>;
}): Promise<{ statusCode: number; body: T }> {
  const key = options.key?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header between 8 and 200 characters', 400);
  }
  const requestHash = sha256(stable(options.body));
  const existing = await IdempotencyModel.findOne({ key, scope: options.scope });
  if (existing) return replay(existing.requestHash, requestHash, existing.status, existing.statusCode ?? null, existing.responseBody);

  try {
    await IdempotencyModel.create({ key, scope: options.scope, requestHash, status: 'processing' });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const raced = await IdempotencyModel.findOne({ key, scope: options.scope });
    if (!raced) throw new AppError('IDEMPOTENCY_CONFLICT', 'This idempotency key is already in use', 409);
    return replay(raced.requestHash, requestHash, raced.status, raced.statusCode ?? null, raced.responseBody);
  }

  let result: { statusCode: number; body: T };
  try {
    result = await options.execute();
  } catch (error) {
    await IdempotencyModel.deleteOne({ key, scope: options.scope, status: 'processing' });
    throw error;
  }
  await IdempotencyModel.updateOne(
    { key, scope: options.scope },
    { $set: { status: 'completed', statusCode: result.statusCode, responseBody: result.body } },
  );
  return result;
}

function replay(
  storedHash: string,
  requestHash: string,
  status: string,
  statusCode: number | null,
  responseBody: unknown,
): { statusCode: number; body: never } {
  if (storedHash !== requestHash) {
    throw new AppError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request', 409);
  }
  if (status === 'completed' && statusCode) {
    return { statusCode, body: responseBody as never };
  }
  throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'A request with this idempotency key is still processing', 409);
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}
