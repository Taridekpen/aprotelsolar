import { formatKoboAsNaira, type Permission, type PublicationStatus } from '@aprotel/shared';
import { ProductModel } from '../models/product.model.js';
import { ServiceModel } from '../models/service.model.js';
import { findPublishedService, listPublishedServices } from '../repositories/catalog.repository.js';
import { AppError } from '../utils/errors.js';
import { isDuplicateKey } from '../utils/object-id.js';
import { allocateSlug } from '../utils/slug.js';
import { recordAudit } from './audit.service.js';
import { syncMediaUsage } from './media.service.js';

interface Actor {
  id: string;
  permissions: Permission[];
  ipAddress?: string;
  userAgent?: string;
}

interface ServiceInput {
  name: string;
  slug?: string;
  description: string;
  imageIds?: string[];
  features?: string[];
  startingPrice?: number | null;
  availability?: 'available' | 'unavailable';
  relatedProductIds?: string[];
  displayOrder?: number;
  publicationStatus?: PublicationStatus;
}

export async function listPublicServices() {
  return (await listPublishedServices()).map(presentService);
}

export async function getPublicService(slug: string) {
  const service = await findPublishedService(slug);
  if (!service) throw new AppError('NOT_FOUND', 'Service was not found', 404);
  return presentService(service);
}

export async function listAdminServices() {
  return (await ServiceModel.find().sort({ displayOrder: 1, name: 1 })).map(presentService);
}

export async function createService(input: ServiceInput, actor: Actor) {
  await assertProducts(input.relatedProductIds ?? []);
  const slug = await allocateSlug(input.slug, input.name, async (candidate) => Boolean(await ServiceModel.exists({ slug: candidate })));
  try {
    const service = await ServiceModel.create({
      name: input.name,
      slug,
      description: input.description,
      imageIds: input.imageIds ?? [],
      features: input.features ?? [],
      startingPriceKobo: input.startingPrice ?? null,
      availability: input.availability ?? 'available',
      relatedProductIds: input.relatedProductIds ?? [],
      displayOrder: input.displayOrder ?? 0,
      publicationStatus: input.publicationStatus ?? 'draft',
    });
    await syncMediaUsage({ resourceType: 'service', resourceId: String(service._id), field: 'images' }, input.imageIds ?? []);
    await recordAudit({ actorId: actor.id, action: 'service.create', resourceType: 'service', resourceId: String(service._id), ipAddress: actor.ipAddress, userAgent: actor.userAgent });
    return presentService(service);
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'A service with that slug already exists', 409);
    throw error;
  }
}

export async function updateService(id: string, input: Partial<ServiceInput>, actor: Actor) {
  const service = await ServiceModel.findById(id);
  if (!service) throw new AppError('NOT_FOUND', 'Service was not found', 404);
  if (input.relatedProductIds) await assertProducts(input.relatedProductIds);
  if (input.name) service.name = input.name;
  if (input.slug) service.slug = await allocateSlug(input.slug, service.name, async (candidate) => Boolean(await ServiceModel.exists({ slug: candidate, _id: { $ne: id } })));
  if (input.description) service.description = input.description;
  if (input.imageIds) service.set('imageIds', input.imageIds);
  if (input.features) service.features = input.features;
  if (input.startingPrice !== undefined) service.startingPriceKobo = input.startingPrice;
  if (input.availability) service.availability = input.availability;
  if (input.relatedProductIds) service.set('relatedProductIds', input.relatedProductIds);
  if (input.displayOrder !== undefined) service.displayOrder = input.displayOrder;
  if (input.publicationStatus && input.publicationStatus !== service.publicationStatus) {
    if (!actor.permissions.includes('services:publish')) {
      throw new AppError('FORBIDDEN', 'You do not have permission to change publication status', 403);
    }
    service.publicationStatus = input.publicationStatus;
  }
  await service.save();
  if (input.imageIds) await syncMediaUsage({ resourceType: 'service', resourceId: id, field: 'images' }, input.imageIds);
  await recordAudit({ actorId: actor.id, action: 'service.update', resourceType: 'service', resourceId: id, ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  return presentService(service);
}

async function assertProducts(ids: string[]) {
  if (ids.length === 0) return;
  const count = await ProductModel.countDocuments({ _id: { $in: ids }, deletedAt: null });
  if (count !== ids.length) throw new AppError('VALIDATION_ERROR', 'One or more related products were not found', 400);
}

export function presentService(service: {
  _id: { toString(): string };
  name: string;
  slug: string;
  description: string;
  imageIds: Array<{ toString(): string }>;
  features: string[];
  startingPriceKobo?: number | null;
  availability: string;
  relatedProductIds: Array<{ toString(): string }>;
  displayOrder: number;
  publicationStatus: string;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(service._id),
    name: service.name,
    slug: service.slug,
    description: service.description,
    imageIds: service.imageIds.map((id) => String(id)),
    features: service.features,
    currency: 'NGN',
    startingPrice: service.startingPriceKobo == null ? null : formatKoboAsNaira(service.startingPriceKobo),
    availability: service.availability,
    relatedProductIds: service.relatedProductIds.map((id) => String(id)),
    displayOrder: service.displayOrder,
    publicationStatus: service.publicationStatus,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}
