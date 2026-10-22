import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { app, connectTestDatabase, createSuperAdmin, login, panelSpec, resetDatabase } from './helpers.js';

beforeAll(async () => {
  await connectTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  await createSuperAdmin();
});

async function catalogue() {
  const { agent, csrf } = await login();
  const token = csrf ?? '';
  const category = await agent
    .post('/api/v1/admin/categories')
    .set('X-CSRF-Token', token)
    .send({ name: 'Solar Panels', specificationProfile: 'solar_panel', publicationStatus: 'published' });
  const product = await agent
    .post('/api/v1/admin/products')
    .set('X-CSRF-Token', token)
    .send({
      name: '450W Panel',
      sku: 'PNL-450',
      brand: 'Deye',
      categoryId: category.body.data.id,
      description: 'Monocrystalline panel used for catalogue and checkout tests.',
      shortDescription: '450W monocrystalline panel',
      sellingPrice: '150000.00',
      costPrice: '90000.00',
      specifications: panelSpec(),
      specificationsVerified: true,
      publicationStatus: 'published',
    });
  const branch = await agent.post('/api/v1/admin/branches').set('X-CSRF-Token', token).send({
    name: 'Yenagoa HQ',
    code: 'YEN-HQ',
    addressLine1: 'Suite 5 Destiny Plaza',
    city: 'Yenagoa',
    state: 'Bayelsa',
    phone: '09122948902',
    isCentral: true,
  });
  await agent.post('/api/v1/admin/inventory/receipts').set('X-CSRF-Token', token).send({
    productId: product.body.data.id,
    branchId: branch.body.data.id,
    quantity: 1,
  });
  await agent.patch('/api/v1/admin/settings').set('X-CSRF-Token', token).send({ payment: { enabled: true } });
  return { agent, token, category: category.body.data, product: product.body.data, branch: branch.body.data };
}

describe('catalogue, checkout, and payments', () => {
  it('hides cost prices, prices orders on the server, and confirms payment through the signed webhook', async () => {
    const { agent, token, product } = await catalogue();
    const editor = await agent.post('/api/v1/admin/administrators').set('X-CSRF-Token', token).send({
      fullName: 'Eve Editor',
      email: 'eve@aprotel.test',
      password: 'Editor-pass-phrase-1',
      role: 'editor',
    });
    expect(editor.status).toBe(201);

    const publicProduct = await request(app).get(`/api/v1/products/${product.slug}`);
    expect(publicProduct.status).toBe(200);
    expect(publicProduct.body.data.costPrice).toBeUndefined();
    expect(JSON.stringify(publicProduct.body)).not.toContain('90000');

    const editorSession = await login('eve@aprotel.test', 'Editor-pass-phrase-1');
    const hiddenCost = await editorSession.agent.get(`/api/v1/admin/products/${product.id}`).set('X-CSRF-Token', editorSession.csrf ?? '');
    expect(hiddenCost.status).toBe(200);
    expect(hiddenCost.body.data.costPrice).toBeUndefined();
    const visibleCost = await agent.get(`/api/v1/admin/products/${product.id}`);
    expect(visibleCost.body.data.costPrice).toBe('90000.00');

    const order = await request(app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', 'order-key-0001')
      .send({
        customer: { name: 'Guest Buyer', email: 'guest@example.com', phone: '08012345678' },
        delivery: {
          recipientName: 'Guest Buyer',
          phone: '08012345678',
          addressLine1: '12 Market Road',
          city: 'Yenagoa',
          state: 'Bayelsa',
        },
        includeInstallation: false,
        items: [{ productId: product.id, quantity: 1, unitPrice: '1.00' }],
      });
    expect(order.status).toBe(201);
    expect(order.body.data.total).toBe('150000.00');
    expect(order.body.data.lines[0].unitPrice).toBe('150000.00');

    const replay = await request(app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', 'order-key-0001')
      .send({
        customer: { name: 'Guest Buyer', email: 'guest@example.com', phone: '08012345678' },
        delivery: {
          recipientName: 'Guest Buyer',
          phone: '08012345678',
          addressLine1: '12 Market Road',
          city: 'Yenagoa',
          state: 'Bayelsa',
        },
        items: [{ productId: product.id, quantity: 1 }],
      });
    expect(replay.status).toBe(201);
    expect(replay.body.data.orderNumber).toBe(order.body.data.orderNumber);

    const soldOut = await request(app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', 'order-key-0002')
      .send({
        customer: { name: 'Second Guest', email: 'second@example.com', phone: '08012345679' },
        delivery: {
          recipientName: 'Second Guest',
          phone: '08012345679',
          addressLine1: '13 Market Road',
          city: 'Yenagoa',
          state: 'Bayelsa',
        },
        items: [{ productId: product.id, quantity: 1 }],
      });
    expect(soldOut.status).toBe(409);

    const payment = await request(app)
      .post('/api/v1/payments/initialize')
      .set('Idempotency-Key', 'pay-key-0001')
      .send({ orderNumber: order.body.data.orderNumber, email: 'guest@example.com' });
    expect(payment.status).toBe(201);

    const raw = Buffer.from(JSON.stringify({ event: 'charge.success', reference: 'PAY-WRONG' }));
    const bad = await request(app)
      .post('/api/v1/payments/webhooks/development')
      .set('x-aprotel-signature', 'deadbeef')
      .set('Content-Type', 'application/json')
      .send(raw.toString());
    expect(bad.status).toBe(401);

    const confirmed = await request(app).post('/api/v1/payments/dev/simulate').send({ reference: payment.body.data.reference });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('successful');

    const lookup = await request(app).post('/api/v1/orders/lookup').send({
      orderNumber: order.body.data.orderNumber,
      email: 'guest@example.com',
    });
    expect(lookup.body.data.paymentStatus).toBe('paid');
    expect(lookup.body.data.lines[0].unitPrice).toBe('150000.00');

    await agent.delete(`/api/v1/admin/products/${product.id}`).set('X-CSRF-Token', token);
    const archived = await request(app).get(`/api/v1/products/${product.slug}`);
    expect(archived.status).toBe(404);
    const historical = await request(app).post('/api/v1/orders/lookup').send({
      orderNumber: order.body.data.orderNumber,
      email: 'guest@example.com',
    });
    expect(historical.body.data.lines[0].name).toBe('450W Panel');
    expect(historical.body.data.lines[0].unitPrice).toBe('150000.00');
  });

  it('rejects unsigned payment confirmation and keeps quotations independent of client totals', async () => {
    const { product } = await catalogue();
    const quotation = await request(app).post('/api/v1/quotations').send({
      customer: { name: 'Quote Guest', email: 'quote@example.com', phone: '08020000000', location: 'Yenagoa' },
      state: 'Bayelsa',
      includeInstallation: false,
      applianceSnapshot: { appliances: [{ name: 'Fan', wattage: 80, quantity: 2, hoursPerDay: 6 }] },
      items: [{ productId: product.id, quantity: 2 }],
      total: '1.00',
    });
    expect(quotation.status).toBe(201);
    expect(quotation.body.data.total).toBe('300000.00');
    expect(quotation.body.data.internalNotes).toBeUndefined();

    const body = JSON.stringify({ event: 'charge.success', reference: 'PAY-DOES-NOT-EXIST' });
    const signature = createHmac('sha256', 'test-webhook-secret-value').update(body).digest('hex');
    const missing = await request(app)
      .post('/api/v1/payments/webhooks/development')
      .set('Content-Type', 'application/json')
      .set('x-aprotel-signature', signature)
      .send(body);
    expect(missing.status).toBe(404);
  });

  it('accepts a guest enquiry and returns the solar contract without a design', async () => {
    const { product } = await catalogue();
    const enquiry = await request(app).post('/api/v1/enquiries').send({
      name: 'Site Visitor',
      email: 'visitor@example.com',
      phone: '09122948902',
      location: 'Yenagoa',
      enquiryType: 'installation',
      message: 'I want a site visit before choosing equipment.',
      productIds: [product.id],
    });
    expect(enquiry.status).toBe(201);
    expect(enquiry.body.data.internalNotes).toBeUndefined();

    const calculated = await request(app).post('/api/v1/solar/calculate').send({
      appliances: [{ name: 'Fridge', wattage: 150, quantity: 1, hoursPerDay: 8 }],
    });
    expect(calculated.status).toBe(200);
    expect(calculated.body.data.status).toBe('requirements_only');
    expect(calculated.body.data.design.load.dailyEnergyWh).toBe(1200);
    expect(calculated.body.data.design.selected).toBeNull();
  });
});
