import { formatKoboAsNaira } from '@aprotel/shared';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ProductModel } from '../models/product.model.js';
import { SolarPackageModel } from '../models/solar-package.model.js';
import { AppError } from '../utils/errors.js';
import { createEnquiry } from './enquiry.service.js';
import { createMailer } from './mailer.js';

const lineSchema = z.object({
  kind: z.enum(['product', 'package']),
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Expected an identifier').transform((value) => value.toLowerCase()),
  quantity: z.number().int().positive().max(99),
});

export const orderRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{6,20}$/, 'Enter a valid phone number'),
  note: z.string().trim().max(2000).optional().default(''),
  items: z.array(lineSchema).min(1).max(20),
});

export type OrderRequestInput = z.infer<typeof orderRequestSchema>;

export async function createOrderRequest(input: OrderRequestInput, env: Env) {
  const items = mergeLines(input.items);
  const productIds = items.filter((item) => item.kind === 'product').map((item) => item.id);
  const packageIds = items.filter((item) => item.kind === 'package').map((item) => item.id);
  const [products, packages] = await Promise.all([
    productIds.length
      ? ProductModel.find({ _id: { $in: productIds }, publicationStatus: 'published', deletedAt: null })
      : [],
    packageIds.length
      ? SolarPackageModel.find({ _id: { $in: packageIds }, publicationStatus: 'published' })
      : [],
  ]);
  if (products.length !== productIds.length || packages.length !== packageIds.length) {
    throw new AppError('VALIDATION_ERROR', 'One or more items are not published', 400);
  }
  const lines = items.map((item) => {
    if (item.kind === 'product') {
      const product = products.find((entry) => String(entry._id) === item.id);
      if (!product) throw new AppError('VALIDATION_ERROR', 'One or more items are not published', 400);
      return { quantity: item.quantity, name: product.name, unitPrice: formatKoboAsNaira(product.sellingPriceKobo) };
    }
    const solarPackage = packages.find((entry) => String(entry._id) === item.id);
    if (!solarPackage) throw new AppError('VALIDATION_ERROR', 'One or more items are not published', 400);
    return { quantity: item.quantity, name: solarPackage.name, unitPrice: formatKoboAsNaira(solarPackage.priceKobo) };
  });
  const message = [
    'Catalogue request',
    '',
    ...lines.map((line) => `${line.quantity} × ${line.name} — catalogue price ${line.unitPrice} each`),
    '',
    input.note ? `Note: ${input.note}` : 'Note: none',
    '',
    'Catalogue prices are list prices. Confirm the total with the customer. No payment was taken online.',
  ].join('\n');
  const enquiry = await createEnquiry({
    name: input.name,
    email: input.email,
    phone: input.phone,
    location: 'Not supplied',
    enquiryType: 'product',
    message,
    productIds,
  });
  const emailText = [`From: ${input.name}`, `Phone: ${input.phone}`, `Email: ${input.email}`, '', message].join('\n');
  if (!env.ORDER_NOTIFY_EMAIL) {
    logger.info({ reference: enquiry.reference }, 'Catalogue request saved. ORDER_NOTIFY_EMAIL is not set, so no email was sent.');
  } else {
    try {
      await createMailer(env).sendOrderRequest(env.ORDER_NOTIFY_EMAIL, enquiry.reference, emailText);
    } catch (error) {
      logger.error({ reference: enquiry.reference, err: error }, 'Catalogue request was saved, but the email failed');
    }
  }
  return { reference: enquiry.reference, message: 'Request received. Aprotel will contact you.' };
}

function mergeLines(items: OrderRequestInput['items']) {
  const merged = new Map<string, OrderRequestInput['items'][number]>();
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    const existing = merged.get(key);
    if (existing) existing.quantity = Math.min(99, existing.quantity + item.quantity);
    else merged.set(key, { ...item });
  }
  return [...merged.values()];
}
