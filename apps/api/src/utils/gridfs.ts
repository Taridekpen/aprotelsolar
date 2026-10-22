import { Readable } from 'node:stream';
import mongoose, { Types } from 'mongoose';
import { GRIDFS_BUCKET } from '../config/constants.js';
import { AppError } from './errors.js';

export function mediaBucket(): mongoose.mongo.GridFSBucket {
  const database = mongoose.connection.db;
  if (!database) {
    throw new AppError('DATABASE_UNAVAILABLE', 'Database is not connected', 503);
  }
  return new mongoose.mongo.GridFSBucket(database, { bucketName: GRIDFS_BUCKET });
}

export function uploadBuffer(buffer: Buffer, filename: string, contentType: string): Promise<Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const stream = mediaBucket().openUploadStream(filename, {
      contentType,
      metadata: { contentType },
    });
    stream.on('error', reject);
    stream.on('finish', () => resolve(stream.id));
    Readable.from(buffer).pipe(stream);
  });
}

export async function deleteGridFile(id: unknown): Promise<void> {
  try {
    await mediaBucket().delete(new Types.ObjectId(String(id)));
  } catch (error) {
    if (error instanceof Error && /FileNotFound/i.test(error.message)) return;
    throw error;
  }
}
