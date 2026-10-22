import { AdministratorModel } from '../apps/api/src/models/administrator.model.js';
import { createApp } from '../apps/api/src/app.js';
import { connectDatabase } from '../apps/api/src/config/database.js';
import { loadEnv } from '../apps/api/src/config/env.js';
import { ensureDefaultSettings } from '../apps/api/src/services/settings.service.js';
import { hashPassword } from '../apps/api/src/utils/password.js';
import mongoose from 'mongoose';
import request from 'supertest';

export const PASSWORD = 'Valid-pass-phrase-1';
export const env = loadEnv();
export const app = createApp(env);

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export async function connectTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) await connectDatabase(env);
}

export async function resetDatabase(): Promise<void> {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  await ensureDefaultSettings();
}

export async function createSuperAdmin(): Promise<void> {
  await AdministratorModel.create({
    fullName: 'Ada Admin',
    email: 'ada@aprotel.test',
    passwordHash: await hashPassword(PASSWORD, env),
    role: 'super_administrator',
    status: 'active',
  });
}

export async function login(email = 'ada@aprotel.test', password = PASSWORD) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({ email, password });
  return { agent, response, csrf: response.body?.data?.csrfToken as string | undefined };
}

export function panelSpec() {
  return {
    type: 'solar_panel' as const,
    ratedWattageW: 450,
    voc: 49.5,
    vmp: 41.2,
    isc: 11.6,
    imp: 10.9,
    tempCoeffPmaxPctPerC: -0.35,
    tempCoeffVocPctPerC: -0.27,
    tempCoeffIscPctPerC: 0.05,
    lengthMm: 1900,
    widthMm: 1134,
    depthMm: 35,
  };
}
