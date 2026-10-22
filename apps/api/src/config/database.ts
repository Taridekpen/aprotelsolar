import mongoose from 'mongoose';
import '../models/index.js';
import type { Env } from './env.js';
import { logger } from './logger.js';

export async function connectDatabase(env: Env): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: true,
    serverSelectionTimeoutMS: 10_000,
  });
  await Promise.all(Object.values(mongoose.models).map((registered) => registered.init()));
  logger.info('MongoDB connected');
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}
