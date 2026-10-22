import { formatKoboAsNaira, type EngineeringApproval, type Permission, type QuotationStatus } from '@aprotel/shared';
import { calculateTax, getSettings } from './settings.service.js';
import { QuotationModel } from '../models/quotation.model.js';
import { findQuotationForCustomer } from '../repositories/commerce.repository.js';
import { AppError } from '../utils/errors.js';
import { pageMeta } from '../utils/pagination.js';
import { datedCode } from '../utils/tokens.js';
import { recordAudit } from './audit.service.js';
import { priceSelection } from './commerce.service.js';

interface QuoteInput {
  customer: { name: string; email: string; phone: string; location?: string };
  state: string;
  includeInstallation: boolean;
  applianceSnapshot: { appliances?: unknown[]; notes?: string };
  items?: Array<{ productId: string; quantity: number }>;
  packageIds?: Array<{ packageId: string; quantity: number }>;
}

export async function createQuotation(input: QuoteInput) {
  if ((input.items?.length ?? 0) + (input.packageIds?.length ?? 0) < 1) {
    throw new AppError('VALIDATION_ERROR', 'Add at least one product or solar package', 400);
  }
  const priced = await priceSelection({
    items: input.items,
    packages: input.packageIds,
    state: input.state,
    includeInstallation: input.includeInstallation,
    mode: 'quote',
  });
  const settings = await getSettings();
  const quotation = await QuotationModel.create({
    reference: datedCode('QT'),
    customer: { ...input.customer, location: input.customer.location ?? input.state },
    applianceSnapshot: { ...input.applianceSnapshot, source: 'customer_supplied', submittedAt: new Date().toISOString() },
    lines: priced.lines,
    packageLines: priced.packageLines,
    installationCostKobo: priced.installationCostKobo,
    deliveryCostKobo: priced.deliveryCostKobo,
    taxKobo: priced.taxKobo,
    subtotalKobo: priced.subtotalKobo,
    totalKobo: priced.totalKobo,
    currency: 'NGN',
    status: 'submitted',
    engineeringApproval: 'pending',
    expiresAt: new Date(Date.now() + settings.quotation.validityDays * 24 * 60 * 60 * 1000),
  });
  return presentQuotation(quotation, false);
}

export async function lookupQuotation(reference: string, email: string) {
  const quotation = await findQuotationForCustomer(reference, email);
  if (!quotation) throw new AppError('NOT_FOUND', 'Quotation was not found', 404);
  return presentQuotation(quotation, false);
}

export async function listQuotations(query: { page: number; pageSize: number; status?: string }) {
  const filter = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    QuotationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    QuotationModel.countDocuments(filter),
  ]);
  return { items: items.map((item) => presentQuotation(item, true)), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getQuotation(id: string) {
  const quotation = await QuotationModel.findById(id);
  if (!quotation) throw new AppError('NOT_FOUND', 'Quotation was not found', 404);
  return presentQuotation(quotation, true);
}

export async function updateQuotation(
  id: string,
  input: { status?: QuotationStatus; engineeringApproval?: EngineeringApproval; note?: string },
  actor: { id: string; permissions: Permission[]; ipAddress?: string; userAgent?: string },
) {
  const quotation = await QuotationModel.findById(id);
  if (!quotation) throw new AppError('NOT_FOUND', 'Quotation was not found', 404);
  if (input.engineeringApproval && input.engineeringApproval !== 'pending' && !actor.permissions.includes('quotations:approve')) {
    throw new AppError('FORBIDDEN', 'Engineering approval requires an engineer or administrator', 403);
  }
  if (input.status) quotation.status = input.status;
  if (input.engineeringApproval) {
    quotation.engineeringApproval = input.engineeringApproval;
    if (input.engineeringApproval === 'approved') {
      quotation.approvedBy = actor.id as never;
      quotation.approvedAt = new Date();
      if (quotation.status === 'submitted') quotation.status = 'approved';
    }
  }
  if (input.note) quotation.internalNotes.push({ body: input.note, authorId: actor.id as never, createdAt: new Date() });
  await quotation.save();
  await recordAudit({
    actorId: actor.id,
    action: 'quotation.update',
    resourceType: 'quotation',
    resourceId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { status: input.status, engineeringApproval: input.engineeringApproval },
  });
  return presentQuotation(quotation, true);
}

const CLOSED_QUOTE_STATUSES = new Set(['converted', 'rejected', 'expired']);

export async function adjustQuotationCommercial(
  id: string,
  input: { lines?: Array<{ productId: string; unitPrice: number }>; installationCost?: number; reason: string },
  actor: { id: string; ipAddress?: string; userAgent?: string },
) {
  const quotation = await QuotationModel.findById(id);
  if (!quotation) throw new AppError('NOT_FOUND', 'Quotation was not found', 404);
  if (CLOSED_QUOTE_STATUSES.has(quotation.status)) {
    throw new AppError('CONFLICT', 'This quotation can no longer be commercially adjusted', 409);
  }

  quotation.commercialRevisions.push({
    reason: input.reason,
    actorId: actor.id as never,
    createdAt: new Date(),
    lines: quotation.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      sku: line.sku,
      quantity: line.quantity,
      unitPriceKobo: line.unitPriceKobo,
      lineTotalKobo: line.lineTotalKobo,
      specificationsSnapshot: line.specificationsSnapshot ?? null,
    })),
    packageLines: quotation.packageLines.map((line) => ({
      packageId: line.packageId,
      name: line.name,
      quantity: line.quantity,
      unitPriceKobo: line.unitPriceKobo,
      lineTotalKobo: line.lineTotalKobo,
      installationChargeKobo: line.installationChargeKobo,
      components: line.components,
      pricingBasis: line.pricingBasis,
    })),
    installationCostKobo: quotation.installationCostKobo,
    deliveryCostKobo: quotation.deliveryCostKobo,
    taxKobo: quotation.taxKobo,
    subtotalKobo: quotation.subtotalKobo,
    totalKobo: quotation.totalKobo,
  });

  for (const change of input.lines ?? []) {
    const line = quotation.lines.find((item) => String(item.productId) === change.productId);
    if (!line) throw new AppError('VALIDATION_ERROR', 'A commercial change refers to equipment that is not on this quotation', 400);
    line.unitPriceKobo = change.unitPrice;
    line.lineTotalKobo = change.unitPrice * line.quantity;
  }
  if (input.installationCost != null) quotation.installationCostKobo = input.installationCost;

  const settings = await getSettings();
  const subtotalKobo =
    quotation.lines.reduce((sum, line) => sum + line.lineTotalKobo, 0) +
    quotation.packageLines.reduce((sum, line) => sum + line.lineTotalKobo, 0);
  quotation.subtotalKobo = subtotalKobo;
  quotation.taxKobo = calculateTax(settings, subtotalKobo + quotation.deliveryCostKobo + quotation.installationCostKobo);
  quotation.totalKobo = subtotalKobo + quotation.deliveryCostKobo + quotation.installationCostKobo + quotation.taxKobo;
  await quotation.save();
  await recordAudit({
    actorId: actor.id,
    action: 'quotation.commercial_adjust',
    resourceType: 'quotation',
    resourceId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { reason: input.reason },
  });
  return presentQuotation(quotation, true);
}

function presentQuotation(quotation: any, includeInternal: boolean) {
  const money = formatKoboAsNaira;
  return {
    id: String(quotation._id),
    reference: quotation.reference,
    customer: quotation.customer,
    applianceSnapshot: quotation.applianceSnapshot,
    lines: quotation.lines.map((line: any) => ({
      productId: String(line.productId),
      name: line.name,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: money(line.unitPriceKobo),
      lineTotal: money(line.lineTotalKobo),
      specificationsSnapshot: line.specificationsSnapshot ?? null,
    })),
    packageLines: quotation.packageLines.map((line: any) => ({
      packageId: String(line.packageId),
      name: line.name,
      quantity: line.quantity,
      unitPrice: money(line.unitPriceKobo),
      lineTotal: money(line.lineTotalKobo),
      installationCharge: money(line.installationChargeKobo),
      pricingBasis: 'package_price',
      components: line.components.map((component: any) => ({
        productId: String(component.productId),
        name: component.name,
        sku: component.sku,
        quantity: component.quantity,
        catalogUnitPrice: money(component.unitPriceKobo),
      })),
    })),
    currency: quotation.currency,
    subtotal: money(quotation.subtotalKobo),
    deliveryCost: money(quotation.deliveryCostKobo),
    installationCost: money(quotation.installationCostKobo),
    tax: money(quotation.taxKobo),
    total: money(quotation.totalKobo),
    status: quotation.status,
    engineeringApproval: quotation.engineeringApproval,
    expiresAt: quotation.expiresAt,
    ...(includeInternal
      ? {
          internalNotes: (quotation.internalNotes ?? []).map((note: any) => ({
            body: note.body,
            authorId: String(note.authorId),
            createdAt: note.createdAt,
          })),
          commercialRevisions: (quotation.commercialRevisions ?? []).map((revision: any) => ({
            reason: revision.reason,
            actorId: String(revision.actorId),
            createdAt: revision.createdAt,
            subtotal: money(revision.subtotalKobo),
            deliveryCost: money(revision.deliveryCostKobo),
            installationCost: money(revision.installationCostKobo),
            tax: money(revision.taxKobo),
            total: money(revision.totalKobo),
            lines: revision.lines.map((line: any) => ({
              productId: String(line.productId),
              name: line.name,
              sku: line.sku,
              quantity: line.quantity,
              unitPrice: money(line.unitPriceKobo),
              lineTotal: money(line.lineTotalKobo),
            })),
          })),
        }
      : {}),
    createdAt: quotation.createdAt,
    updatedAt: quotation.updatedAt,
  };
}
