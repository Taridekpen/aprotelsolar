import { formatKoboAsNaira, type Permission, type PublicationStatus } from '@aprotel/shared';
import { ProductModel } from '../models/product.model.js';
import { SolarPackageModel } from '../models/solar-package.model.js';
import { AppError } from '../utils/errors.js';
import { isDuplicateKey } from '../utils/object-id.js';
import { pageMeta } from '../utils/pagination.js';
import { allocateSlug } from '../utils/slug.js';
import { recordAudit } from './audit.service.js';
import { syncMediaUsage } from './media.service.js';

interface Actor {
  id: string;
  permissions: Permission[];
  ipAddress?: string;
  userAgent?: string;
}

interface PackageInput {
  name: string;
  slug?: string;
  description: string;
  imageIds?: string[];
  items: Array<{ productId: string; quantity: number }>;
  estimatedCapacityKw: number;
  inverterSummary: string;
  batteryCapacityKwh: number;
  solarPanelCapacityKw: number;
  runtimeAssumptions: { loadWatts: number; estimatedRuntimeHours: number | null; operatingNotes: string };
  price: number;
  installationCharge: number;
  warranty?: string;
  availability?: 'available' | 'unavailable';
  publicationStatus?: PublicationStatus;
}

export async function listPublicPackages(query: { page: number; pageSize: number }) {
  const packages = await SolarPackageModel.find({ publicationStatus: 'published', availability: 'available' }).sort({ createdAt: -1 });
  const ready = [];
  for (const solarPackage of packages) {
    if (await itemsArePublished(solarPackage.items)) ready.push(solarPackage);
  }
  const start = (query.page - 1) * query.pageSize;
  return {
    items: ready.slice(start, start + query.pageSize).map((item) => presentPackage(item, true)),
    meta: pageMeta(query.page, query.pageSize, ready.length),
  };
}

export async function getPublicPackage(slug: string) {
  const solarPackage = await SolarPackageModel.findOne({ slug, publicationStatus: 'published', availability: 'available' });
  if (!solarPackage || !(await itemsArePublished(solarPackage.items))) {
    throw new AppError('NOT_FOUND', 'Solar package was not found', 404);
  }
  return presentPackage(solarPackage, true);
}

export async function listAdminPackages() {
  const packages = await SolarPackageModel.find().sort({ createdAt: -1 });
  return Promise.all(packages.map(async (item) => ({ ...presentPackage(item, true), catalogReady: await itemsArePublished(item.items) })));
}

export async function createPackage(input: PackageInput, actor: Actor) {
  await assertItems(input.items, input.publicationStatus === 'published');
  const slug = await allocateSlug(input.slug, input.name, async (candidate) => Boolean(await SolarPackageModel.exists({ slug: candidate })));
  try {
    const solarPackage = await SolarPackageModel.create({
      ...mapPackage(input),
      slug,
      publicationStatus: input.publicationStatus ?? 'draft',
    });
    await syncMediaUsage({ resourceType: 'solar_package', resourceId: String(solarPackage._id), field: 'images' }, input.imageIds ?? []);
    await recordAudit({ actorId: actor.id, action: 'package.create', resourceType: 'solar_package', resourceId: String(solarPackage._id), ipAddress: actor.ipAddress, userAgent: actor.userAgent });
    return presentPackage(solarPackage, true);
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'A package with that slug already exists', 409);
    throw error;
  }
}

export async function updatePackage(id: string, input: Partial<PackageInput>, actor: Actor) {
  const solarPackage = await SolarPackageModel.findById(id);
  if (!solarPackage) throw new AppError('NOT_FOUND', 'Solar package was not found', 404);
  const items = input.items ?? solarPackage.items.map((item) => ({ productId: String(item.productId), quantity: item.quantity }));
  const publicationStatus = input.publicationStatus ?? solarPackage.publicationStatus;
  await assertItems(items, publicationStatus === 'published');
  if (input.name) solarPackage.name = input.name;
  if (input.slug) solarPackage.slug = await allocateSlug(input.slug, solarPackage.name, async (candidate) => Boolean(await SolarPackageModel.exists({ slug: candidate, _id: { $ne: id } })));
  if (input.description) solarPackage.description = input.description;
  if (input.imageIds) solarPackage.set('imageIds', input.imageIds);
  if (input.items) solarPackage.set('items', input.items);
  if (input.estimatedCapacityKw !== undefined) solarPackage.estimatedCapacityKw = input.estimatedCapacityKw;
  if (input.inverterSummary) solarPackage.inverterSummary = input.inverterSummary;
  if (input.batteryCapacityKwh !== undefined) solarPackage.batteryCapacityKwh = input.batteryCapacityKwh;
  if (input.solarPanelCapacityKw !== undefined) solarPackage.solarPanelCapacityKw = input.solarPanelCapacityKw;
  if (input.runtimeAssumptions) solarPackage.runtimeAssumptions = input.runtimeAssumptions;
  if (input.price !== undefined) solarPackage.priceKobo = input.price;
  if (input.installationCharge !== undefined) solarPackage.installationChargeKobo = input.installationCharge;
  if (input.warranty !== undefined) solarPackage.warranty = input.warranty ?? '';
  if (input.availability) solarPackage.availability = input.availability;
  if (input.publicationStatus && input.publicationStatus !== solarPackage.publicationStatus) {
    if (!actor.permissions.includes('packages:publish')) {
      throw new AppError('FORBIDDEN', 'You do not have permission to change publication status', 403);
    }
    solarPackage.publicationStatus = input.publicationStatus;
  }
  await solarPackage.save();
  if (input.imageIds) await syncMediaUsage({ resourceType: 'solar_package', resourceId: id, field: 'images' }, input.imageIds);
  await recordAudit({ actorId: actor.id, action: 'package.update', resourceType: 'solar_package', resourceId: id, ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  return presentPackage(solarPackage, true);
}

async function assertItems(items: Array<{ productId: string; quantity: number }>, requirePublished: boolean) {
  const ids = items.map((item) => item.productId);
  const products = await ProductModel.find({ _id: { $in: ids }, deletedAt: null });
  if (products.length !== new Set(ids).size) throw new AppError('VALIDATION_ERROR', 'Solar packages must reference existing products', 400);
  if (requirePublished && products.some((product) => product.publicationStatus !== 'published')) {
    throw new AppError('UNPROCESSABLE', 'Published packages can only include published products', 422);
  }
}

async function itemsArePublished(items: Array<{ productId: { toString(): string } }>) {
  const ids = items.map((item) => String(item.productId));
  const count = await ProductModel.countDocuments({ _id: { $in: ids }, deletedAt: null, publicationStatus: 'published' });
  return count === new Set(ids).size;
}

function mapPackage(input: PackageInput) {
  return {
    name: input.name,
    description: input.description,
    imageIds: input.imageIds ?? [],
    items: input.items,
    estimatedCapacityKw: input.estimatedCapacityKw,
    inverterSummary: input.inverterSummary,
    batteryCapacityKwh: input.batteryCapacityKwh,
    solarPanelCapacityKw: input.solarPanelCapacityKw,
    runtimeAssumptions: input.runtimeAssumptions,
    priceKobo: input.price,
    installationChargeKobo: input.installationCharge,
    warranty: input.warranty ?? '',
    availability: input.availability ?? 'available',
  };
}

export function presentPackage(solarPackage: any, _includeAssumptions: boolean) {
  return {
    id: String(solarPackage._id),
    name: solarPackage.name,
    slug: solarPackage.slug,
    description: solarPackage.description,
    imageIds: solarPackage.imageIds.map((id: { toString(): string }) => String(id)),
    items: solarPackage.items.map((item: { productId: { toString(): string }; quantity: number }) => ({ productId: String(item.productId), quantity: item.quantity })),
    estimatedCapacityKw: solarPackage.estimatedCapacityKw,
    inverterSummary: solarPackage.inverterSummary,
    batteryCapacityKwh: solarPackage.batteryCapacityKwh,
    solarPanelCapacityKw: solarPackage.solarPanelCapacityKw,
    runtimeAssumptions: {
      loadWatts: solarPackage.runtimeAssumptions.loadWatts,
      estimatedRuntimeHours: solarPackage.runtimeAssumptions.estimatedRuntimeHours ?? null,
      operatingNotes: solarPackage.runtimeAssumptions.operatingNotes,
    },
    currency: 'NGN',
    price: formatKoboAsNaira(solarPackage.priceKobo),
    installationCharge: formatKoboAsNaira(solarPackage.installationChargeKobo),
    warranty: solarPackage.warranty,
    availability: solarPackage.availability,
    publicationStatus: solarPackage.publicationStatus,
    createdAt: solarPackage.createdAt,
    updatedAt: solarPackage.updatedAt,
  };
}
