import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetSentMails, sentMails } from '../apps/api/src/services/mailer.js';
import { app, connectTestDatabase, createSuperAdmin, login, PASSWORD, resetDatabase } from './helpers.js';

beforeAll(async () => {
  await connectTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  resetSentMails();
  await createSuperAdmin();
});

describe('administrator authentication', () => {
  it('sets an HTTP-only session cookie and requires CSRF for mutations', async () => {
    const { agent, response, csrf } = await login();
    expect(response.status).toBe(200);
    const cookie = response.headers['set-cookie']?.join(';') ?? '';
    expect(cookie).toContain('aprotel.sid');
    expect(cookie).toContain('HttpOnly');
    expect(response.body.data.administrator.passwordHash).toBeUndefined();

    const blocked = await agent.post('/api/v1/admin/categories').send({
      name: 'Solar Panels',
      specificationProfile: 'solar_panel',
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('CSRF_FAILED');

    const created = await agent
      .post('/api/v1/admin/categories')
      .set('X-CSRF-Token', csrf ?? '')
      .send({ name: 'Solar Panels', specificationProfile: 'solar_panel', publicationStatus: 'published' });
    expect(created.status).toBe(201);

    const loggedOut = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf ?? '');
    expect(loggedOut.status).toBe(200);
    const after = await agent.get('/api/v1/auth/me');
    expect(after.status).toBe(401);
  });

  it('locks an account after repeated failures and resets a password with a single-use token', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await login('ada@aprotel.test', 'wrong-password-1');
      expect(failed.response.status).toBe(401);
    }
    const locked = await login();
    expect(locked.response.status).toBe(429);

    await resetDatabase();
    await createSuperAdmin();
    const forgot = await (await import('supertest')).default(app).post('/api/v1/auth/forgot-password').send({ email: 'ada@aprotel.test' });
    expect(forgot.status).toBe(200);
    expect(forgot.body.data.message).toContain('If an account exists');
    const resetUrl = sentMails[0]?.text ?? '';
    const token = new URL(resetUrl.split('\n').find((line) => line.startsWith('http')) ?? resetUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    const reset = await (await import('supertest')).default(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'Replacement-pass-2' });
    expect(reset.status).toBe(200);
    const reused = await (await import('supertest')).default(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'Replacement-pass-3' });
    expect(reused.status).toBe(400);

    const oldPassword = await login();
    expect(oldPassword.response.status).toBe(401);
    const signedIn = await login('ada@aprotel.test', 'Replacement-pass-2');
    expect(signedIn.response.status).toBe(200);
  });

  it('rejects a public visitor from the administration API', async () => {
    const response = await (await import('supertest')).default(app).get('/api/v1/admin/products');
    expect(response.status).toBe(401);
    expect(response.body.error.stack).toBeUndefined();
  });
});

void PASSWORD;
