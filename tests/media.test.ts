import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PNG, app, connectTestDatabase, createSuperAdmin, login, resetDatabase } from './helpers.js';

beforeAll(async () => {
  await connectTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await createSuperAdmin();
});

describe('GridFS media', () => {
  it('stores an image in MongoDB and serves the original bytes and a webp variant', async () => {
    const { agent, csrf } = await login();
    const uploaded = await agent
      .post('/api/v1/admin/media')
      .set('X-CSRF-Token', csrf ?? '')
      .field('altText', 'A 1 pixel test image')
      .attach('file', PNG, { filename: 'panel.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.mimeType).toBe('image/png');
    expect(uploaded.body.data.width).toBe(1);

    const original = await request(app).get(`/api/v1/media/${uploaded.body.data.id}`);
    expect(original.status).toBe(200);
    expect(original.headers['content-type']).toContain('image/png');
    expect(original.headers['cache-control']).toContain('max-age=3600');
    expect(Buffer.compare(original.body as Buffer, PNG)).toBe(0);

    const alias = await request(app).get(`/api/media/${uploaded.body.data.id}?variant=thumbnail`);
    expect(alias.status).toBe(200);
    expect(alias.headers['content-type']).toContain('image/webp');

    const cached = await request(app).get(`/api/v1/media/${uploaded.body.data.id}`).set('If-None-Match', original.headers.etag);
    expect(cached.status).toBe(304);

    const rejected = await agent
      .post('/api/v1/admin/media')
      .set('X-CSRF-Token', csrf ?? '')
      .field('altText', 'Not an image')
      .attach('file', Buffer.from('not an image'), { filename: 'notes.png', contentType: 'image/png' });
    expect(rejected.status).toBe(400);

    const removed = await agent.delete(`/api/v1/admin/media/${uploaded.body.data.id}`).set('X-CSRF-Token', csrf ?? '');
    expect(removed.status).toBe(200);
    const gone = await request(app).get(`/api/v1/media/${uploaded.body.data.id}`);
    expect(gone.status).toBe(404);
  });
});
