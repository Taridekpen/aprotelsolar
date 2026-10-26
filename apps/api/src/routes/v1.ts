import {
  administratorCreateSchema,
  administratorUpdateSchema,
  branchWriteSchema,
  branchUpdateSchema,
  categoryUpdateSchema,
  categoryWriteSchema,
  changePasswordSchema,
  contentPageSchema,
  contentUpdateSchema,
  contentWriteSchema,
  devPaymentSchema,
  dashboardQuerySchema,
  enquiryCreateSchema,
  enquiryUpdateSchema,
  ENQUIRY_TYPES,
  FULFILMENT_STATUSES,
  forgotPasswordSchema,
  listQuerySchema,
  loginSchema,
  mediaUpdateSchema,
  objectIdSchema,
  orderCancelSchema,
  orderCreateSchema,
  orderFulfilmentSchema,
  orderLookupSchema,
  packageUpdateSchema,
  packageWriteSchema,
  paginationSchema,
  paymentInitializeSchema,
  productListQuerySchema,
  productUpdateSchema,
  productWriteSchema,
  quotationCommercialSchema,
  quotationCreateSchema,
  quotationUpdateSchema,
  reorderSchema,
  resetPasswordSchema,
  serviceUpdateSchema,
  serviceWriteSchema,
  settingsPatchSchema,
  stockAdjustmentSchema,
  stockReceiptSchema,
  stockThresholdSchema,
  stockTransferSchema,
} from '@aprotel/shared';
import { calculateInputSchema, recommendInputSchema } from '@aprotel/solar-engine';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { actorFrom, sendData, sendList } from '../controllers/http.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireCsrf } from '../middleware/csrf.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { imageUpload } from '../middleware/upload.js';
import { queryOf, validateBody, validateQuery } from '../middleware/validate.js';
import { openApiSpec } from '../openapi/spec.js';
import { changePassword, createAdministrator, currentCsrf, listAdministrators, login, logout, requestPasswordReset, resetPassword, updateAdministrator } from '../services/auth.service.js';
import { createBranch, listAdminBranches, listPublicBranches, updateBranch } from '../services/branch.service.js';
import { archiveCategory, createCategory, listAdminCategories, listPublicCategories, reorderCategories, updateCategory } from '../services/category.service.js';
import { createContent, deleteContent, getPublicPage, listAdminContent, updateContent } from '../services/content.service.js';
import { createEnquiry, getEnquiry, listEnquiries, updateEnquiry } from '../services/enquiry.service.js';
import {
  adjustStock,
  listInventory,
  listLowStock,
  listMovements,
  presentLevel,
  receiveStock,
  setLowStockThreshold,
  transferStock,
} from '../services/inventory.service.js';
import { deleteMedia, listMedia, openPublicMedia, presentMedia, replaceMedia, updateMedia, uploadMedia } from '../services/media.service.js';
import { createService, getPublicService, listAdminServices, listPublicServices, updateService } from '../services/offering.service.js';
import { cancelGuestOrder, cancelOrder, createOrder, getOrder, listOrders, lookupOrder, updateFulfilment } from '../services/order.service.js';
import { createPackage, getPublicPackage, listAdminPackages, listPublicPackages, updatePackage } from '../services/package.service.js';
import { developmentCheckout, handleWebhook, initializePayment, simulateDevelopmentPayment, verifyWithProvider } from '../services/payment.service.js';
import { createProduct, getAdminProduct, getPublicProduct, listAdminProducts, listPublicProducts, setPublication, updateProduct } from '../services/product.service.js';
import { adjustQuotationCommercial, createQuotation, getQuotation, listQuotations, lookupQuotation, updateQuotation } from '../services/quotation.service.js';
import { dashboard, listAudit } from '../services/report.service.js';
import { getSettings, presentSettings, updateSettings } from '../services/settings.service.js';
import { createOrderRequest, orderRequestSchema } from '../services/order-request.service.js';
import { calculateSolar, recommendSolar } from '../services/solar.service.js';
import { AppError } from '../utils/errors.js';
import { quotationPdfLines, renderTextPdf } from '../utils/pdf.js';
import mongoose from 'mongoose';

const inventoryQuery = paginationSchema.extend({
  productId: objectIdSchema.optional(),
  branchId: objectIdSchema.optional(),
});
const mediaQuery = paginationSchema.extend({
  variant: z.enum(['original', 'thumbnail', 'medium']).optional(),
});
const contentQuery = paginationSchema.extend({
  type: z.string().trim().max(80).optional(),
});
const enquiryQuery = listQuerySchema.extend({
  enquiryType: z.enum(ENQUIRY_TYPES).optional(),
});
const orderQuery = listQuerySchema.extend({
  fulfilment: z.enum(FULFILMENT_STATUSES).optional(),
});
const secretKeys = ['secretKey', 'secret', 'paystackSecret', 'flutterwaveSecret', 'webhookSecret', 'password', 'apiKey'];

export function createV1Router(env: Env): Router {
  const router = Router();
  const auth = authenticate(env);
  const csrf = requireCsrf();
  const publicWriteLimit = rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: Math.min(env.RATE_LIMIT_MAX, 30), name: 'public-write' });
  const loginLimit = rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.LOGIN_IP_MAX, name: 'login' });

  router.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });
  router.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ data: { status: ready ? 'ready' : 'not_ready', database: ready ? 'connected' : 'disconnected' } });
  });
  router.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  router.post('/auth/login', loginLimit, validateBody(loginSchema), asyncHandler(async (req, res) => {
    const result = await login({ ...req.body, ipAddress: req.ip ?? '', userAgent: req.get('user-agent') ?? '', env });
    const { setAuthCookies } = await import('../utils/cookies.js');
    setAuthCookies(res, env, result.sessionToken, result.csrfToken);
    sendData(res, { administrator: result.administrator, csrfToken: result.csrfToken });
  }));
  router.post('/auth/forgot-password', publicWriteLimit, validateBody(forgotPasswordSchema), asyncHandler(async (req, res) => {
    sendData(res, await requestPasswordReset(req.body.email, env));
  }));
  router.post('/auth/reset-password', publicWriteLimit, validateBody(resetPasswordSchema), asyncHandler(async (req, res) => {
    await resetPassword(req.body.token, req.body.password, env);
    sendData(res, { message: 'Password updated. Sign in with the new password.' });
  }));
  router.get('/auth/me', auth, asyncHandler(async (req, res) => {
    sendData(res, { id: req.admin!.id, email: req.admin!.email, fullName: req.admin!.fullName, role: req.admin!.role, permissions: req.admin!.permissions });
  }));
  router.get('/auth/csrf', auth, asyncHandler(async (req, res) => {
    const csrfToken = await currentCsrf(req.admin!.sessionId);
    const { setAuthCookies } = await import('../utils/cookies.js');
    const token = req.cookies?.['aprotel.sid'] as string;
    setAuthCookies(res, env, token, csrfToken);
    sendData(res, { csrfToken });
  }));
  router.post('/auth/logout', auth, csrf, asyncHandler(async (req, res) => {
    await logout(req.admin!.sessionId, req.admin!.id, actorFrom(req));
    const { clearAuthCookies } = await import('../utils/cookies.js');
    clearAuthCookies(res, env);
    sendData(res, { message: 'Signed out' });
  }));
  router.patch('/auth/password', auth, csrf, validateBody(changePasswordSchema), asyncHandler(async (req, res) => {
    await changePassword({ administratorId: req.admin!.id, currentPassword: req.body.currentPassword, newPassword: req.body.newPassword, env });
    const { clearAuthCookies } = await import('../utils/cookies.js');
    clearAuthCookies(res, env);
    sendData(res, { message: 'Password updated. Sign in again.' });
  }));

  router.get('/products', validateQuery(productListQuerySchema), asyncHandler(async (req, res) => {
    const result = await listPublicProducts(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  router.get('/products/:slug', asyncHandler(async (req, res) => sendData(res, await getPublicProduct(req.params.slug))));
  router.get('/categories', asyncHandler(async (_req, res) => sendData(res, await listPublicCategories())));
  router.get('/services', asyncHandler(async (_req, res) => sendData(res, await listPublicServices())));
  router.get('/services/:slug', asyncHandler(async (req, res) => sendData(res, await getPublicService(req.params.slug))));
  router.get('/solar-packages', validateQuery(paginationSchema), asyncHandler(async (req, res) => {
    const result = await listPublicPackages(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  router.get('/solar-packages/:slug', asyncHandler(async (req, res) => sendData(res, await getPublicPackage(req.params.slug))));
  router.get('/branches', asyncHandler(async (_req, res) => sendData(res, await listPublicBranches())));
  router.get('/content/:page', asyncHandler(async (req, res) => {
    const page = contentPageSchema.parse(req.params.page);
    sendData(res, await getPublicPage(page));
  }));

  router.post('/enquiries', publicWriteLimit, validateBody(enquiryCreateSchema), asyncHandler(async (req, res) => {
    sendData(res, await createEnquiry(req.body), 201);
  }));
  router.post('/order-requests', publicWriteLimit, validateBody(orderRequestSchema), asyncHandler(async (req, res) => {
    sendData(res, await createOrderRequest(req.body, env), 201);
  }));
  router.post('/quotations', publicWriteLimit, validateBody(quotationCreateSchema), asyncHandler(async (req, res) => {
    sendData(res, await createQuotation(req.body), 201);
  }));
  router.post('/quotations/lookup', publicWriteLimit, validateBody(orderLookupSchema.extend({ reference: z.string().trim().min(4).max(40) }).omit({ orderNumber: true })), asyncHandler(async (req, res) => {
    sendData(res, await lookupQuotation(req.body.reference, req.body.email));
  }));
  router.post('/quotations/pdf', publicWriteLimit, validateBody(orderLookupSchema.extend({ reference: z.string().trim().min(4).max(40) }).omit({ orderNumber: true })), asyncHandler(async (req, res) => {
    const quotation = await lookupQuotation(req.body.reference, req.body.email);
    const pdf = renderTextPdf(quotationPdfLines(quotation));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quotation.reference}.pdf"`);
    res.send(pdf);
  }));
  router.post('/orders', publicWriteLimit, validateBody(orderCreateSchema), asyncHandler(async (req, res) => {
    const result = await createOrder(req.body, req.get('idempotency-key'));
    res.status(result.statusCode).json(result.body);
  }));
  router.post('/orders/lookup', publicWriteLimit, validateBody(orderLookupSchema), asyncHandler(async (req, res) => {
    sendData(res, await lookupOrder(req.body.orderNumber, req.body.email));
  }));
  router.post('/orders/cancel', publicWriteLimit, validateBody(orderCancelSchema), asyncHandler(async (req, res) => {
    sendData(res, await cancelGuestOrder(req.body));
  }));
  router.post('/payments/initialize', publicWriteLimit, validateBody(paymentInitializeSchema), asyncHandler(async (req, res) => {
    const result = await initializePayment({ ...req.body, idempotencyKey: req.get('idempotency-key'), env });
    res.status(result.statusCode).json(result.body);
  }));
  router.post('/payments/verify', publicWriteLimit, validateBody(devPaymentSchema.extend({ email: z.string().email() })), asyncHandler(async (req, res) => {
    sendData(res, await verifyWithProvider(req.body.reference, req.body.email.toLowerCase(), env));
  }));
  router.post('/payments/webhooks/:provider', asyncHandler(async (req, res) => {
    sendData(res, await handleWebhook(req.params.provider, req.headers, req.rawBody, env));
  }));
  router.get('/payments/return', asyncHandler(async (req, res) => {
    sendData(res, { message: 'Return received. Payment status is updated only after provider verification.', reference: req.query.reference ?? null });
  }));
  if (env.PAYMENT_PROVIDER === 'development' && env.NODE_ENV !== 'production') {
    router.get('/payments/dev/checkout/:reference', asyncHandler(async (req, res) => {
      sendData(res, await developmentCheckout(req.params.reference, env));
    }));
    router.post('/payments/dev/simulate', publicWriteLimit, validateBody(devPaymentSchema), asyncHandler(async (req, res) => {
      sendData(res, await simulateDevelopmentPayment(req.body.reference, env));
    }));
  }
  router.post('/solar/calculate', publicWriteLimit, validateBody(calculateInputSchema), asyncHandler(async (req, res) => {
    sendData(res, await calculateSolar(req.body));
  }));
  router.post('/solar/recommend', publicWriteLimit, validateBody(recommendInputSchema), asyncHandler(async (req, res) => {
    sendData(res, await recommendSolar(req.body));
  }));

  const admin = Router();
  admin.use(auth);

  admin.get('/products', requirePermission('products:read'), validateQuery(productListQuerySchema), asyncHandler(async (req, res) => {
    const result = await listAdminProducts(queryOf(req), actorFrom(req));
    sendList(res, result.items, result.meta);
  }));
  admin.get('/products/:id', requirePermission('products:read'), asyncHandler(async (req, res) => sendData(res, await getAdminProduct(req.params.id, actorFrom(req)))));
  admin.post('/products', requirePermission('products:write'), csrf, validateBody(productWriteSchema), asyncHandler(async (req, res) => {
    sendData(res, await createProduct(req.body, actorFrom(req)), 201);
  }));
  admin.patch('/products/:id', requirePermission('products:write'), csrf, validateBody(productUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateProduct(req.params.id, req.body, actorFrom(req)));
  }));
  admin.post('/products/:id/publish', requirePermission('products:publish'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await setPublication(req.params.id, 'published', actorFrom(req)));
  }));
  admin.post('/products/:id/unpublish', requirePermission('products:publish'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await setPublication(req.params.id, 'draft', actorFrom(req)));
  }));
  admin.delete('/products/:id', requirePermission('products:publish'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await setPublication(req.params.id, 'archived', actorFrom(req)));
  }));

  admin.get('/categories', requirePermission('categories:read'), asyncHandler(async (_req, res) => sendData(res, await listAdminCategories())));
  admin.post('/categories', requirePermission('categories:write'), csrf, validateBody(categoryWriteSchema), asyncHandler(async (req, res) => {
    sendData(res, await createCategory(req.body, actorFrom(req)), 201);
  }));
  admin.patch('/categories/reorder', requirePermission('categories:write'), csrf, validateBody(reorderSchema), asyncHandler(async (req, res) => {
    sendData(res, await reorderCategories(req.body.ids, actorFrom(req)));
  }));
  admin.patch('/categories/:id', requirePermission('categories:write'), csrf, validateBody(categoryUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateCategory(req.params.id, req.body, actorFrom(req)));
  }));
  admin.delete('/categories/:id', requirePermission('categories:write'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await archiveCategory(req.params.id, actorFrom(req)));
  }));

  admin.get('/services', requirePermission('services:read'), asyncHandler(async (_req, res) => sendData(res, await listAdminServices())));
  admin.post('/services', requirePermission('services:write'), csrf, validateBody(serviceWriteSchema), asyncHandler(async (req, res) => {
    sendData(res, await createService(req.body, actorFrom(req)), 201);
  }));
  admin.patch('/services/:id', requirePermission('services:write'), csrf, validateBody(serviceUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateService(req.params.id, req.body, actorFrom(req)));
  }));
  admin.post('/services/:id/publish', requirePermission('services:publish'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await updateService(req.params.id, { publicationStatus: 'published' }, actorFrom(req)));
  }));
  admin.delete('/services/:id', requirePermission('services:publish'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await updateService(req.params.id, { publicationStatus: 'archived' }, actorFrom(req)));
  }));

  admin.get('/solar-packages', requirePermission('packages:read'), asyncHandler(async (_req, res) => sendData(res, await listAdminPackages())));
  admin.post('/solar-packages', requirePermission('packages:write'), csrf, validateBody(packageWriteSchema), asyncHandler(async (req, res) => {
    sendData(res, await createPackage(req.body, actorFrom(req)), 201);
  }));
  admin.patch('/solar-packages/:id', requirePermission('packages:write'), csrf, validateBody(packageUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updatePackage(req.params.id, req.body, actorFrom(req)));
  }));
  admin.post('/solar-packages/:id/publish', requirePermission('packages:publish'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await updatePackage(req.params.id, { publicationStatus: 'published' }, actorFrom(req)));
  }));
  admin.delete('/solar-packages/:id', requirePermission('packages:publish'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await updatePackage(req.params.id, { publicationStatus: 'archived' }, actorFrom(req)));
  }));

  admin.get('/branches', requirePermission('branches:read'), asyncHandler(async (_req, res) => sendData(res, await listAdminBranches())));
  admin.post('/branches', requirePermission('branches:write'), csrf, validateBody(branchWriteSchema), asyncHandler(async (req, res) => {
    sendData(res, await createBranch(req.body, actorFrom(req)), 201);
  }));
  admin.patch('/branches/:id', requirePermission('branches:write'), csrf, validateBody(branchUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateBranch(req.params.id, req.body, actorFrom(req)));
  }));

  admin.get('/inventory', requirePermission('inventory:read'), validateQuery(inventoryQuery), asyncHandler(async (req, res) => {
    const result = await listInventory(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  admin.get('/inventory/low-stock', requirePermission('inventory:read'), validateQuery(paginationSchema), asyncHandler(async (req, res) => {
    const result = await listLowStock(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  admin.get('/inventory/movements', requirePermission('inventory:read'), validateQuery(inventoryQuery), asyncHandler(async (req, res) => {
    const result = await listMovements(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  admin.post('/inventory/receipts', requirePermission('inventory:receive'), csrf, validateBody(stockReceiptSchema), asyncHandler(async (req, res) => {
    sendData(res, presentLevel(await receiveStock({ ...req.body, administratorId: req.admin!.id })), 201);
  }));
  admin.post('/inventory/adjustments', requirePermission('inventory:adjust'), csrf, validateBody(stockAdjustmentSchema), asyncHandler(async (req, res) => {
    sendData(res, presentLevel(await adjustStock({ ...req.body, administratorId: req.admin!.id })));
  }));
  admin.post('/inventory/transfers', requirePermission('inventory:transfer'), csrf, validateBody(stockTransferSchema), asyncHandler(async (req, res) => {
    const result = await transferStock({ ...req.body, administratorId: req.admin!.id });
    sendData(res, { source: presentLevel(result.source), destination: presentLevel(result.destination) });
  }));
  admin.patch('/inventory/thresholds', requirePermission('inventory:adjust'), csrf, validateBody(stockThresholdSchema), asyncHandler(async (req, res) => {
    sendData(res, presentLevel(await setLowStockThreshold({ ...req.body, administratorId: req.admin!.id })));
  }));

  admin.get('/media', requirePermission('media:read'), validateQuery(paginationSchema), asyncHandler(async (req, res) => {
    const result = await listMedia(queryOf(req));
    sendList(res, result.items.map(presentMedia), result.meta);
  }));
  admin.post('/media', requirePermission('media:upload'), csrf, imageUpload(env), asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('MEDIA_INVALID', 'Choose an image file', 400);
    const body = z.object({ altText: z.string().trim().min(1).max(200) }).parse(req.body);
    const asset = await uploadMedia({ env, buffer: req.file.buffer, filename: req.file.originalname, altText: body.altText, administratorId: req.admin!.id });
    sendData(res, presentMedia(asset), 201);
  }));
  admin.patch('/media/:id', requirePermission('media:upload'), csrf, validateBody(mediaUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, presentMedia(await updateMedia(req.params.id, req.body.altText, req.admin!.id)));
  }));
  admin.put('/media/:id/content', requirePermission('media:upload'), csrf, imageUpload(env), asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('MEDIA_INVALID', 'Choose an image file', 400);
    sendData(res, presentMedia(await replaceMedia(req.params.id, { env, buffer: req.file.buffer, filename: req.file.originalname, administratorId: req.admin!.id })));
  }));
  admin.delete('/media/:id', requirePermission('media:delete'), csrf, asyncHandler(async (req, res) => {
    await deleteMedia(req.params.id, req.admin!.id);
    sendData(res, { deleted: true });
  }));

  admin.get('/content', requirePermission('content:read'), validateQuery(contentQuery), asyncHandler(async (req, res) => {
    const query = queryOf<{ type?: string }>(req);
    sendData(res, await listAdminContent(query.type));
  }));
  admin.post('/content', requirePermission('content:write'), csrf, validateBody(contentWriteSchema), asyncHandler(async (req, res) => {
    sendData(res, await createContent(req.body, actorFrom(req)), 201);
  }));
  admin.patch('/content/:id', requirePermission('content:write'), csrf, validateBody(contentUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateContent(req.params.id, req.body, actorFrom(req)));
  }));
  admin.delete('/content/:id', requirePermission('content:write'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await deleteContent(req.params.id, actorFrom(req)));
  }));

  admin.get('/enquiries', requirePermission('enquiries:read'), validateQuery(enquiryQuery), asyncHandler(async (req, res) => {
    const result = await listEnquiries(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  admin.get('/enquiries/:id', requirePermission('enquiries:read'), asyncHandler(async (req, res) => sendData(res, await getEnquiry(req.params.id))));
  admin.patch('/enquiries/:id', requirePermission('enquiries:update'), csrf, validateBody(enquiryUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateEnquiry(req.params.id, req.body, actorFrom(req)));
  }));

  admin.get('/quotations', requirePermission('quotations:read'), validateQuery(listQuerySchema), asyncHandler(async (req, res) => {
    const result = await listQuotations(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  admin.get('/quotations/:id', requirePermission('quotations:read'), asyncHandler(async (req, res) => sendData(res, await getQuotation(req.params.id))));
  admin.get('/quotations/:id/pdf', requirePermission('quotations:read'), asyncHandler(async (req, res) => {
    const quotation = await getQuotation(req.params.id);
    const pdf = renderTextPdf(quotationPdfLines(quotation));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quotation.reference}.pdf"`);
    res.send(pdf);
  }));
  admin.patch('/quotations/:id', requirePermission('quotations:update'), csrf, validateBody(quotationUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateQuotation(req.params.id, req.body, actorFrom(req)));
  }));
  admin.post('/quotations/:id/commercial-adjustment', requirePermission('quotations:update'), csrf, validateBody(quotationCommercialSchema), asyncHandler(async (req, res) => {
    sendData(res, await adjustQuotationCommercial(req.params.id, req.body, actorFrom(req)));
  }));

  admin.get('/orders', requirePermission('orders:read'), validateQuery(orderQuery), asyncHandler(async (req, res) => {
    const result = await listOrders(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  admin.get('/orders/:id', requirePermission('orders:read'), asyncHandler(async (req, res) => sendData(res, await getOrder(req.params.id))));
  admin.patch('/orders/:id/fulfilment', requirePermission('orders:update'), csrf, validateBody(orderFulfilmentSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateFulfilment(req.params.id, req.body, actorFrom(req)));
  }));
  admin.post('/orders/:id/cancel', requirePermission('orders:cancel'), csrf, asyncHandler(async (req, res) => {
    sendData(res, await cancelOrder(req.params.id, actorFrom(req)));
  }));

  admin.get('/administrators', requirePermission('administrators:read'), validateQuery(paginationSchema), asyncHandler(async (req, res) => {
    const result = await listAdministrators(queryOf(req));
    sendList(res, result.items, result.meta);
  }));
  admin.post('/administrators', requirePermission('administrators:manage'), csrf, validateBody(administratorCreateSchema), asyncHandler(async (req, res) => {
    sendData(res, await createAdministrator(req.body, req.admin!.id, env), 201);
  }));
  admin.patch('/administrators/:id', requirePermission('administrators:manage'), csrf, validateBody(administratorUpdateSchema), asyncHandler(async (req, res) => {
    sendData(res, await updateAdministrator(req.params.id, req.body, { id: req.admin!.id, role: req.admin!.role }));
  }));

  admin.get('/settings', requirePermission('settings:read'), asyncHandler(async (_req, res) => {
    sendData(res, presentSettings(await getSettings()));
  }));
  admin.patch('/settings', requirePermission('settings:update'), csrf, asyncHandler(async (req, res) => {
    if (secretKeys.some((key) => Object.prototype.hasOwnProperty.call(req.body, key))) {
      throw new AppError('SENSITIVE_CONFIGURATION', 'Payment secrets must stay in server environment configuration', 400);
    }
    const patch = settingsPatchSchema.parse(req.body);
    sendData(res, presentSettings(await updateSettings(patch, actorFrom(req))));
  }));

  admin.get('/dashboard', requirePermission('reports:read'), validateQuery(dashboardQuerySchema), asyncHandler(async (req, res) => sendData(res, await dashboard(queryOf(req)))));
  admin.get('/reports/summary', requirePermission('reports:read'), validateQuery(dashboardQuerySchema), asyncHandler(async (req, res) => sendData(res, await dashboard(queryOf(req)))));
  admin.get('/audit-logs', requirePermission('audit:read'), validateQuery(paginationSchema), asyncHandler(async (req, res) => {
    const result = await listAudit(queryOf(req));
    sendList(res, result.items, result.meta);
  }));

  router.use('/admin', admin);
  return router;
}

export async function streamMedia(req: Request, res: Response): Promise<void> {
  const variant = typeof req.query.variant === 'string' ? mediaQuery.parse({ variant: req.query.variant, page: 1 }).variant : undefined;
  const media = await openPublicMedia(req.params.id, variant);
  const ifNoneMatch = req.get('if-none-match');
  if (ifNoneMatch === media.etag) {
    res.status(304).end();
    return;
  }
  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Content-Length', String(media.size));
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('ETag', media.etag);
  res.setHeader('Content-Disposition', `inline; filename="${media.filename.replace(/"/g, '')}"`);
  media.stream.on('error', () => {
    if (!res.headersSent) res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Media was not found' } });
  });
  media.stream.pipe(res);
}
