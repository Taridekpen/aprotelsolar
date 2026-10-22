import mongoose, { type ClientSession } from 'mongoose';
import { logger } from '../config/logger.js';

let transactionsSupported: boolean | null = null;

function transactionUnsupported(error: unknown) {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: number; message?: string; cause?: unknown };
    if (typeof record.message === 'string' && /transaction numbers are only allowed/i.test(record.message)) return true;
    current = record.cause;
  }
  return false;
}

async function runWithoutTransaction<T>(work: (session: ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();
  try {
    return await work(session);
  } finally {
    await session.endSession();
  }
}

/**
 * Runs inventory and catalogue writes in a MongoDB transaction when the server
 * is a replica set. A standalone development server cannot start transactions;
 * those writes continue on a normal session so local administration still persists.
 */
export async function withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  if (transactionsSupported === false) return runWithoutTransaction(work);

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    transactionsSupported = true;
    return result;
  } catch (error) {
    if (transactionsSupported === true || !transactionUnsupported(error)) throw error;
    transactionsSupported = false;
    logger.warn('MongoDB transactions are unavailable on this standalone server. Writes will continue without a transaction. Use a replica set in production.');
  } finally {
    await session.endSession();
  }
  return runWithoutTransaction(work);
}
