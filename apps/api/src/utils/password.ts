import argon2 from 'argon2';
import type { Env } from '../config/env.js';

export function argonOptions(env: Env): argon2.Options {
  if (env.NODE_ENV === 'test') {
    return { type: argon2.argon2id, memoryCost: 4096, timeCost: 1, parallelism: 1 };
  }
  return { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
}

export async function hashPassword(password: string, env: Env): Promise<string> {
  return argon2.hash(password, argonOptions(env));
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
