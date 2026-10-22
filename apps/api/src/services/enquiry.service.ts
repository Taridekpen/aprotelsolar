import type { EnquiryStatus, EnquiryType, Permission } from '@aprotel/shared';
import { AdministratorModel } from '../models/administrator.model.js';
import { EnquiryModel } from '../models/enquiry.model.js';
import { ProductModel } from '../models/product.model.js';
import { AppError } from '../utils/errors.js';
import { escapeRegex, pageMeta } from '../utils/pagination.js';
import { datedCode } from '../utils/tokens.js';
import { recordAudit } from './audit.service.js';

interface EnquiryInput {
  name: string;
  email: string;
  phone: string;
  location: string;
  enquiryType: EnquiryType;
  message: string;
  productIds?: string[];
  solarCalculation?: Record<string, unknown>;
  recommendationSnapshot?: Record<string, unknown>;
}

export async function createEnquiry(input: EnquiryInput) {
  if (input.productIds?.length) {
    const count = await ProductModel.countDocuments({
      _id: { $in: input.productIds },
      publicationStatus: 'published',
      deletedAt: null,
    });
    if (count !== new Set(input.productIds).size) {
      throw new AppError('VALIDATION_ERROR', 'One or more selected products are not available', 400);
    }
  }
  const enquiry = await EnquiryModel.create({
    reference: datedCode('ENQ'),
    name: input.name,
    email: input.email,
    phone: input.phone,
    location: input.location,
    enquiryType: input.enquiryType,
    message: input.message,
    productIds: input.productIds ?? [],
    solarCalculation: input.solarCalculation ? { source: 'customer_supplied', payload: input.solarCalculation } : null,
    recommendationSnapshot: input.recommendationSnapshot ? { source: 'customer_supplied', payload: input.recommendationSnapshot } : null,
    status: 'new',
  });
  return presentEnquiry(enquiry, false);
}

export async function listEnquiries(query: { page: number; pageSize: number; status?: string; enquiryType?: string; q?: string }) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.enquiryType) filter.enquiryType = query.enquiryType;
  if (query.q) {
    const expression = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: expression }, { email: expression }, { reference: expression }, { message: expression }];
  }
  const [items, total] = await Promise.all([
    EnquiryModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    EnquiryModel.countDocuments(filter),
  ]);
  return { items: items.map((item) => presentEnquiry(item, true)), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getEnquiry(id: string) {
  const enquiry = await EnquiryModel.findById(id);
  if (!enquiry) throw new AppError('NOT_FOUND', 'Enquiry was not found', 404);
  return presentEnquiry(enquiry, true);
}

export async function updateEnquiry(
  id: string,
  input: { status?: EnquiryStatus; assignedTo?: string | null; note?: string },
  actor: { id: string; permissions: Permission[]; ipAddress?: string; userAgent?: string },
) {
  const enquiry = await EnquiryModel.findById(id);
  if (!enquiry) throw new AppError('NOT_FOUND', 'Enquiry was not found', 404);
  if (input.assignedTo) {
    const administrator = await AdministratorModel.findOne({ _id: input.assignedTo, status: 'active' });
    if (!administrator) throw new AppError('VALIDATION_ERROR', 'Assigned administrator was not found', 400);
    enquiry.set('assignedTo', administrator._id);
  }
  if (input.assignedTo === null) enquiry.set('assignedTo', null);
  if (input.status) enquiry.status = input.status;
  if (input.note) enquiry.internalNotes.push({ body: input.note, authorId: actor.id, createdAt: new Date() });
  await enquiry.save();
  await recordAudit({
    actorId: actor.id,
    action: 'enquiry.update',
    resourceType: 'enquiry',
    resourceId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { status: input.status },
  });
  return presentEnquiry(enquiry, true);
}

function presentEnquiry(
  enquiry: {
    _id: { toString(): string };
    reference: string;
    name: string;
    email: string;
    phone: string;
    location: string;
    enquiryType: string;
    message: string;
    productIds: Array<{ toString(): string }>;
    solarCalculation?: unknown;
    recommendationSnapshot?: unknown;
    status: string;
    internalNotes?: Array<{ body: string; authorId: { toString(): string }; createdAt?: Date }>;
    assignedTo?: { toString(): string } | null;
    createdAt?: Date;
    updatedAt?: Date;
  },
  includeInternal: boolean,
) {
  return {
    id: String(enquiry._id),
    reference: enquiry.reference,
    name: enquiry.name,
    email: enquiry.email,
    phone: enquiry.phone,
    location: enquiry.location,
    enquiryType: enquiry.enquiryType,
    message: enquiry.message,
    productIds: enquiry.productIds.map((id) => String(id)),
    solarCalculation: enquiry.solarCalculation ?? null,
    recommendationSnapshot: enquiry.recommendationSnapshot ?? null,
    status: enquiry.status,
    ...(includeInternal
      ? {
          internalNotes: (enquiry.internalNotes ?? []).map((note) => ({
            body: note.body,
            authorId: String(note.authorId),
            createdAt: note.createdAt,
          })),
          assignedTo: enquiry.assignedTo ? String(enquiry.assignedTo) : null,
        }
      : {}),
    createdAt: enquiry.createdAt,
    updatedAt: enquiry.updatedAt,
  };
}
