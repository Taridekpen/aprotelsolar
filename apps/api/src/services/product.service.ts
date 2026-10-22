import {
  draftSpecificationSchema,
  formatKoboAsNaira,
  verifiedSpecificationSchema,
  type Permission,
  type ProductAvailability,
  type PublicationStatus,
} from '@aprotel/shared';
import { CategoryModel } from '../models/category.model.js';
import { ProductModel } from '../models/product.model.js';
import { queryProducts, type ProductQuery } from '../repositories/product.repository.js';
import { AppError } from '../utils/errors.js';
import { isDuplicateKey, toObjectId } from '../utils/object-id.js';
import { pageMeta } from '../utils/pagination.js';
import { allocateSlug } from '../utils/slug.js';
import { randomCode } from '../utils/tokens.js';
import { withTransaction } from '../utils/transaction.js';
import { recordAudit } from './audit.service.js';
import { branchAvailability, ensureStockLevelsForProduct } from './inventory.service.js';
import { syncMediaUsage } from './media.service.js';

interface Actor {
  id: string;
  permissions: Permission[];
  ipAddress?: string;
  userAgent?: string;
}

interface ProductInput {
  name: string;
  slug?: string;
  sku: string;
  brand: string;
  categoryId: string;
  subcategoryId?: string | null;
  description: string;
  shortDescription: string;
  sellingPrice: number;
  compareAtPrice?: number | null;
  costPrice?: number;
  imageIds?: string[];
  specifications: { type: 'solar_panel' | 'battery' | 'inverter' | 'generic' };
  specificationsVerified?: boolean;
  warranty?: string;
  installationRequirements?: string;
  availability?: ProductAvailability;
  featured?: boolean;
  publicationStatus?: PublicationStatus;
}

export async function listPublicProducts(query: ProductQuery) {
  const { items, total } = await queryProducts(query, 'public');
  return { items: items.map((product) => presentProduct(product, { includeCost: false })), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getPublicProduct(slug: string) {
  const product = await ProductModel.findOne({ slug, publicationStatus: 'published', deletedAt: null });
  if (!product) throw new AppError('NOT_FOUND', 'Product was not found', 404);
  const stock = await branchAvailability([String(product._id)]);
  return { ...presentProduct(product, { includeCost: false }), stock: stock.get(String(product._id)) ?? [] };
}

export async function listAdminProducts(query: ProductQuery, actor: Actor) {
  const { items, total } = await queryProducts(query, 'admin');
  const includeCost = actor.permissions.includes('products:read_cost');
  return { items: items.map((product) => presentProduct(product, { includeCost })), meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getAdminProduct(id: string, actor: Actor) {
  const product = await ProductModel.findById(id);
  if (!product) throw new AppError('NOT_FOUND', 'Product was not found', 404);
  const stock = await branchAvailability([String(product._id)]);
  return {
    ...presentProduct(product, { includeCost: actor.permissions.includes('products:read_cost') }),
    stock: stock.get(String(product._id)) ?? [],
  };
}

export async function createProduct(input: ProductInput, actor: Actor) {
  guardCost(input, actor, true);
  guardVerification(input.specificationsVerified, actor);
  const placement = await resolvePlacement(input.categoryId, input.subcategoryId ?? null);
  const specifications = normalizeSpecs(input.specifications, Boolean(input.specificationsVerified));
  if (specifications.type !== placement.profile) {
    throw new AppError('VALIDATION_ERROR', 'Specifications do not match the category profile', 400);
  }
  assertPrice(input.sellingPrice, input.compareAtPrice);
  const publicationStatus = input.publicationStatus ?? 'draft';
  if (input.featured && publicationStatus !== 'published') {
    throw new AppError('UNPROCESSABLE', 'Only published products can be featured', 422);
  }
  if (publicationStatus === 'published') assertCategoryPublished(placement);

  const slug = await allocateSlug(input.slug, input.name, async (candidate) => Boolean(await ProductModel.exists({ slug: candidate })));
  try {
    const product = await withTransaction(async (session) => {
      const [created] = await ProductModel.create(
        [
          {
            publicId: `APR-${randomCode(8)}`,
            name: input.name,
            slug,
            sku: input.sku.toUpperCase(),
            brand: input.brand,
            categoryId: placement.category._id,
            subcategoryId: placement.subcategory?._id ?? null,
            description: input.description,
            shortDescription: input.shortDescription,
            sellingPriceKobo: input.sellingPrice,
            compareAtPriceKobo: input.compareAtPrice ?? null,
            costPriceKobo: input.costPrice ?? 0,
            imageIds: input.imageIds ?? [],
            specifications,
            specificationProfile: placement.profile,
            specificationsVerified: Boolean(input.specificationsVerified),
            warranty: input.warranty ?? '',
            installationRequirements: input.installationRequirements ?? '',
            availability: input.availability ?? 'out_of_stock',
            featured: Boolean(input.featured),
            publicationStatus,
          },
        ],
        { session },
      );
      await ensureStockLevelsForProduct(created!._id, session);
      await syncMediaUsage({ resourceType: 'product', resourceId: String(created!._id), field: 'images' }, input.imageIds ?? [], session);
      return created!;
    });
    await recordAudit({ actorId: actor.id, action: 'product.create', resourceType: 'product', resourceId: String(product._id), ipAddress: actor.ipAddress, userAgent: actor.userAgent });
    return presentProduct(product, { includeCost: actor.permissions.includes('products:read_cost') });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'A product with that SKU or slug already exists', 409);
    throw error;
  }
}

export async function updateProduct(id: string, input: Partial<ProductInput>, actor: Actor) {
  const product = await ProductModel.findById(id);
  if (!product) throw new AppError('NOT_FOUND', 'Product was not found', 404);
  if (input.costPrice !== undefined) guardCost(input, actor, false);
  if (input.specificationsVerified === true) guardVerification(true, actor);

  const categoryId = input.categoryId ?? String(product.categoryId);
  const subcategoryId = input.subcategoryId === undefined ? (product.subcategoryId ? String(product.subcategoryId) : null) : input.subcategoryId;
  const placement = await resolvePlacement(categoryId, subcategoryId);
  const specifications = input.specifications
    ? normalizeSpecs(input.specifications, input.specificationsVerified ?? product.specificationsVerified)
    : product.specifications;
  if ((input.specifications || input.specificationsVerified) && (specifications as { type: string }).type !== placement.profile) {
    throw new AppError('VALIDATION_ERROR', 'Specifications do not match the category profile', 400);
  }
  const sellingPrice = input.sellingPrice ?? product.sellingPriceKobo;
  const compareAt = input.compareAtPrice === undefined ? product.compareAtPriceKobo : input.compareAtPrice;
  assertPrice(sellingPrice, compareAt);

  if (input.name) product.name = input.name;
  if (input.slug) product.slug = await allocateSlug(input.slug, product.name, async (candidate) => Boolean(await ProductModel.exists({ slug: candidate, _id: { $ne: id } })));
  if (input.sku) product.sku = input.sku.toUpperCase();
  if (input.brand) product.brand = input.brand;
  product.set('categoryId', placement.category._id);
  product.set('subcategoryId', placement.subcategory?._id ?? null);
  product.specificationProfile = placement.profile;
  if (input.description) product.description = input.description;
  if (input.shortDescription) product.shortDescription = input.shortDescription;
  if (input.sellingPrice !== undefined) product.sellingPriceKobo = input.sellingPrice;
  if (input.compareAtPrice !== undefined) product.compareAtPriceKobo = input.compareAtPrice;
  if (input.costPrice !== undefined) product.costPriceKobo = input.costPrice;
  if (input.warranty !== undefined) product.warranty = input.warranty ?? '';
  if (input.installationRequirements !== undefined) product.installationRequirements = input.installationRequirements ?? '';
  if (input.availability) product.availability = input.availability;
  if (input.specifications) product.specifications = specifications;
  if (input.specificationsVerified !== undefined) product.specificationsVerified = input.specificationsVerified;
  if (input.imageIds) product.set('imageIds', input.imageIds.map((imageId) => toObjectId(imageId)));
  if (input.publicationStatus && input.publicationStatus !== product.publicationStatus) {
    if (!actor.permissions.includes('products:publish')) {
      throw new AppError('FORBIDDEN', 'You do not have permission to change publication status', 403);
    }
    product.publicationStatus = input.publicationStatus;
  }
  if (input.featured !== undefined) product.featured = input.featured;
  if (product.publicationStatus !== 'published') product.featured = false;
  if (product.publicationStatus === 'published') assertCategoryPublished(placement);
  if (product.specificationsVerified) normalizeSpecs(product.specifications as ProductInput['specifications'], true);

  await product.save();
  if (input.imageIds) await syncMediaUsage({ resourceType: 'product', resourceId: id, field: 'images' }, input.imageIds);
  await recordAudit({ actorId: actor.id, action: 'product.update', resourceType: 'product', resourceId: id, ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  return presentProduct(product, { includeCost: actor.permissions.includes('products:read_cost') });
}

export async function setPublication(id: string, status: PublicationStatus, actor: Actor) {
  return updateProduct(id, { publicationStatus: status, featured: status === 'published' ? undefined : false }, actor);
}

function guardCost(input: Partial<ProductInput>, actor: Actor, creating: boolean) {
  if (input.costPrice === undefined && creating) return;
  if (input.costPrice !== undefined && !actor.permissions.includes('products:read_cost')) {
    throw new AppError('FORBIDDEN', 'Cost price is restricted to authorized administrators', 403);
  }
}

function guardVerification(verified: boolean | undefined, actor: Actor) {
  if (verified && !actor.permissions.includes('products:verify_specs')) {
    throw new AppError('FORBIDDEN', 'Only engineers or administrators can verify technical specifications', 403);
  }
}

function assertPrice(selling: number, compareAt?: number | null) {
  if (compareAt != null && compareAt <= selling) {
    throw new AppError('VALIDATION_ERROR', 'Comparison price must be higher than the selling price', 400);
  }
}

function assertCategoryPublished(placement: Awaited<ReturnType<typeof resolvePlacement>>) {
  if (placement.category.publicationStatus !== 'published') {
    throw new AppError('UNPROCESSABLE', 'Publish the category before publishing this product', 422);
  }
  if (placement.subcategory && placement.subcategory.publicationStatus !== 'published') {
    throw new AppError('UNPROCESSABLE', 'Publish the subcategory before publishing this product', 422);
  }
}

async function resolvePlacement(categoryId: string, subcategoryId: string | null) {
  const category = await CategoryModel.findById(categoryId);
  if (!category || category.publicationStatus === 'archived') throw new AppError('VALIDATION_ERROR', 'Choose an active category', 400);
  if (!subcategoryId) return { category, subcategory: null, profile: category.specificationProfile };
  const subcategory = await CategoryModel.findById(subcategoryId);
  if (!subcategory || String(subcategory.parentId) !== String(category._id)) {
    throw new AppError('VALIDATION_ERROR', 'Subcategory does not belong to the selected category', 400);
  }
  if (subcategory.publicationStatus === 'archived') throw new AppError('VALIDATION_ERROR', 'Choose an active subcategory', 400);
  return { category, subcategory, profile: subcategory.specificationProfile };
}

function normalizeSpecs(specifications: ProductInput['specifications'], verified: boolean) {
  const schema = verified ? verifiedSpecificationSchema : draftSpecificationSchema;
  const parsed = schema.safeParse(specifications);
  if (!parsed.success) {
    throw new AppError('SPECIFICATIONS_INCOMPLETE', 'Technical specifications are incomplete for verification', 422, {
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return parsed.data;
}

export function presentProduct(
  product: {
    _id: { toString(): string };
    publicId: string;
    name: string;
    slug: string;
    sku: string;
    brand: string;
    categoryId: { toString(): string };
    subcategoryId?: { toString(): string } | null;
    description: string;
    shortDescription: string;
    sellingPriceKobo: number;
    compareAtPriceKobo?: number | null;
    costPriceKobo: number;
    inventoryQuantity: number;
    imageIds: Array<{ toString(): string }>;
    specifications: unknown;
    specificationProfile: string;
    specificationsVerified: boolean;
    warranty: string;
    installationRequirements: string;
    availability: string;
    featured: boolean;
    publicationStatus: string;
    createdAt?: Date;
    updatedAt?: Date;
  },
  options: { includeCost: boolean },
) {
  return {
    id: String(product._id),
    publicId: product.publicId,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    brand: product.brand,
    categoryId: String(product.categoryId),
    subcategoryId: product.subcategoryId ? String(product.subcategoryId) : null,
    description: product.description,
    shortDescription: product.shortDescription,
    currency: 'NGN',
    sellingPrice: formatKoboAsNaira(product.sellingPriceKobo),
    compareAtPrice: product.compareAtPriceKobo == null ? null : formatKoboAsNaira(product.compareAtPriceKobo),
    ...(options.includeCost ? { costPrice: formatKoboAsNaira(product.costPriceKobo) } : {}),
    inventoryQuantity: product.inventoryQuantity,
    imageIds: product.imageIds.map((id) => String(id)),
    specifications: product.specifications,
    specificationProfile: product.specificationProfile,
    specificationsVerified: product.specificationsVerified,
    warranty: product.warranty,
    installationRequirements: product.installationRequirements,
    availability: product.availability,
    featured: product.featured,
    publicationStatus: product.publicationStatus,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
