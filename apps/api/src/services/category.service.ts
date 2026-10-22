import { type Permission, type PublicationStatus, type SpecificationProfile } from '@aprotel/shared';
import { CategoryModel } from '../models/category.model.js';
import { listPublishedCategories } from '../repositories/catalog.repository.js';
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

interface CategoryInput {
  name: string;
  slug?: string;
  description?: string;
  imageId?: string | null;
  parentId?: string | null;
  specificationProfile: SpecificationProfile;
  displayOrder?: number;
  publicationStatus?: PublicationStatus;
}

export async function listPublicCategories() {
  const categories = await listPublishedCategories();
  return categories.map(presentCategory);
}

export async function listAdminCategories() {
  const categories = await CategoryModel.find().sort({ displayOrder: 1, name: 1 });
  return categories.map(presentCategory);
}

export async function createCategory(input: CategoryInput, actor: Actor) {
  await assertParent(null, input.parentId ?? null);
  const slug = await allocateSlug(input.slug, input.name, async (candidate) => Boolean(await CategoryModel.exists({ slug: candidate })));
  try {
    const category = await CategoryModel.create({
      name: input.name,
      slug,
      description: input.description ?? '',
      imageId: input.imageId ?? null,
      parentId: input.parentId ?? null,
      specificationProfile: input.specificationProfile,
      displayOrder: input.displayOrder ?? 0,
      publicationStatus: input.publicationStatus ?? 'draft',
    });
    if (input.imageId) await syncMediaUsage({ resourceType: 'category', resourceId: String(category._id), field: 'image' }, [input.imageId]);
    await recordAudit({ actorId: actor.id, action: 'category.create', resourceType: 'category', resourceId: String(category._id), ipAddress: actor.ipAddress, userAgent: actor.userAgent });
    return presentCategory(category);
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'A category with that slug already exists', 409);
    throw error;
  }
}

export async function updateCategory(id: string, input: Partial<CategoryInput>, actor: Actor) {
  const category = await CategoryModel.findById(id);
  if (!category) throw new AppError('NOT_FOUND', 'Category was not found', 404);
  if (input.parentId !== undefined) await assertParent(id, input.parentId);
  if (input.name) category.name = input.name;
  if (input.slug || input.name) {
    const base = input.slug ?? category.slug;
    if (input.slug) category.slug = await allocateSlug(base, category.name, async (candidate) => Boolean(await CategoryModel.exists({ slug: candidate, _id: { $ne: id } })));
  }
  if (input.description !== undefined) category.description = input.description ?? '';
  if (input.specificationProfile) category.specificationProfile = input.specificationProfile;
  if (input.displayOrder !== undefined) category.displayOrder = input.displayOrder;
  if (input.publicationStatus) category.publicationStatus = input.publicationStatus;
  if (input.parentId !== undefined) category.set('parentId', input.parentId);
  if (input.imageId !== undefined) category.set('imageId', input.imageId);
  await category.save();
  if (input.imageId !== undefined) {
    await syncMediaUsage({ resourceType: 'category', resourceId: id, field: 'image' }, input.imageId ? [input.imageId] : []);
  }
  await recordAudit({ actorId: actor.id, action: 'category.update', resourceType: 'category', resourceId: id, ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  return presentCategory(category);
}

export async function reorderCategories(ids: string[], actor: Actor) {
  const categories = await CategoryModel.find({ _id: { $in: ids } });
  if (categories.length !== ids.length) throw new AppError('VALIDATION_ERROR', 'One or more categories were not found', 400);
  await Promise.all(ids.map((id, index) => CategoryModel.updateOne({ _id: id }, { $set: { displayOrder: index } })));
  await recordAudit({ actorId: actor.id, action: 'category.reorder', resourceType: 'category', resourceId: 'all', ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  return listAdminCategories();
}

export async function archiveCategory(id: string, actor: Actor) {
  return updateCategory(id, { publicationStatus: 'archived' }, actor);
}

async function assertParent(categoryId: string | null, parentId: string | null) {
  if (!parentId) return;
  if (categoryId && categoryId === parentId) throw new AppError('VALIDATION_ERROR', 'A category cannot be its own parent', 400);
  const seen = new Set<string>();
  let current: string | null = parentId;
  while (current) {
    if (categoryId && current === categoryId) throw new AppError('VALIDATION_ERROR', 'Category parent assignment would create a cycle', 400);
    if (seen.has(current) || seen.size > 8) throw new AppError('VALIDATION_ERROR', 'Category nesting is too deep', 400);
    seen.add(current);
    const parent: { parentId?: unknown } | null = await CategoryModel.findById(current).lean();
    if (!parent) throw new AppError('NOT_FOUND', 'Parent category was not found', 404);
    current = parent.parentId ? String(parent.parentId) : null;
  }
}

export function presentCategory(category: {
  _id: { toString(): string };
  name: string;
  slug: string;
  description: string;
  imageId?: { toString(): string } | null;
  parentId?: { toString(): string } | null;
  specificationProfile: string;
  displayOrder: number;
  publicationStatus: string;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageId: category.imageId ? String(category.imageId) : null,
    parentId: category.parentId ? String(category.parentId) : null,
    specificationProfile: category.specificationProfile,
    displayOrder: category.displayOrder,
    publicationStatus: category.publicationStatus,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}
