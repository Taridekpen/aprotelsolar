import { Types } from 'mongoose';
import { AppError } from './errors.js';

export function toObjectId(id: string, label = 'identifier'): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError('INVALID_ID', `Invalid ${label}`, 400);
  }
  return new Types.ObjectId(id);
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000;
}
