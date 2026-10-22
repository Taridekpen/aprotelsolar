import { resolvePermissions } from '@aprotel/shared';
import { describe, expect, it } from 'vitest';
import { formatKoboAsNaira, parseNairaToKobo } from '@aprotel/shared';
import request from 'supertest';
import { app } from './helpers.js';

describe('platform contracts', () => {
  it('keeps cost and administrator management away from editors', () => {
    const editor = resolvePermissions('editor', null);
    expect(editor).not.toContain('products:read_cost');
    expect(editor).not.toContain('administrators:manage');
    expect(resolvePermissions('super_administrator', null)).toContain('administrators:manage');
    expect(resolvePermissions('super_administrator', ['products:read'])).toEqual(['products:read']);
  });

  it('rounds NGN amounts to kobo without float drift', () => {
    expect(parseNairaToKobo('10.10')).toBe(1010);
    expect(parseNairaToKobo('150000')).toBe(15_000_000);
    expect(formatKoboAsNaira(1010)).toBe('10.10');
  });

  it('serves health and OpenAPI metadata', async () => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    const spec = await request(app).get('/api/v1/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.paths['/orders']).toBeTruthy();
    expect(spec.body.paths['/auth/login']).toBeTruthy();
    expect(spec.body.info.title).toBe('Aprotel Solar API');
  });
});
