import { CONTENT_PAGES, contentBodySchemas, type ContentPage, type ContentType, type Permission, type PublicationStatus } from '@aprotel/shared';
import { ContentEntryModel } from '../models/content.model.js';
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

interface ContentInput {
  type: ContentType;
  slug?: string;
  title: string;
  summary?: string;
  body: unknown;
  imageIds?: string[];
  displayOrder?: number;
  publicationStatus?: PublicationStatus;
  seo?: { title?: string; description?: string };
}

export async function getPublicPage(page: ContentPage) {
  const types = CONTENT_PAGES[page];
  const entries = await ContentEntryModel.find({ type: { $in: types }, publicationStatus: 'published' }).sort({ displayOrder: 1, title: 1 });
  return { page, items: entries.map(presentContent) };
}

export async function listAdminContent(type?: string) {
  const filter = type ? { type } : {};
  const entries = await ContentEntryModel.find(filter).sort({ type: 1, displayOrder: 1 });
  return entries.map(presentContent);
}

export async function createContent(input: ContentInput, actor: Actor) {
  const body = contentBodySchemas[input.type].parse(input.body);
  const slug = await allocateSlug(input.slug, input.title, async (candidate) => Boolean(await ContentEntryModel.exists({ type: input.type, slug: candidate })));
  try {
    const entry = await ContentEntryModel.create({
      type: input.type,
      slug,
      title: input.title,
      summary: input.summary ?? '',
      body,
      imageIds: input.imageIds ?? [],
      displayOrder: input.displayOrder ?? 0,
      publicationStatus: input.publicationStatus ?? 'draft',
      seo: { title: input.seo?.title ?? '', description: input.seo?.description ?? '' },
    });
    await syncMediaUsage({ resourceType: 'content', resourceId: String(entry._id), field: 'images' }, input.imageIds ?? []);
    await recordAudit({ actorId: actor.id, action: 'content.create', resourceType: 'content', resourceId: String(entry._id), ipAddress: actor.ipAddress, userAgent: actor.userAgent });
    return presentContent(entry);
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'Content with that slug already exists for this type', 409);
    throw error;
  }
}

export async function updateContent(id: string, input: Partial<Omit<ContentInput, 'type'>>, actor: Actor) {
  const entry = await ContentEntryModel.findById(id);
  if (!entry) throw new AppError('NOT_FOUND', 'Content was not found', 404);
  if (input.body !== undefined) entry.body = contentBodySchemas[entry.type as ContentType].parse(input.body);
  if (input.title) entry.title = input.title;
  if (input.slug) {
    entry.slug = await allocateSlug(input.slug, entry.title, async (candidate) =>
      Boolean(await ContentEntryModel.exists({ type: entry.type, slug: candidate, _id: { $ne: id } })),
    );
  }
  if (input.summary !== undefined) entry.summary = input.summary;
  if (input.imageIds) entry.set('imageIds', input.imageIds);
  if (input.displayOrder !== undefined) entry.displayOrder = input.displayOrder;
  if (input.publicationStatus && input.publicationStatus !== entry.publicationStatus) {
    if (!actor.permissions.includes('content:write')) {
      throw new AppError('FORBIDDEN', 'You do not have permission to change publication status', 403);
    }
    entry.publicationStatus = input.publicationStatus;
  }
  if (input.seo) entry.seo = { title: input.seo.title ?? entry.seo?.title ?? '', description: input.seo.description ?? entry.seo?.description ?? '' };
  await entry.save();
  if (input.imageIds) await syncMediaUsage({ resourceType: 'content', resourceId: id, field: 'images' }, input.imageIds);
  await recordAudit({ actorId: actor.id, action: 'content.update', resourceType: 'content', resourceId: id, ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  return presentContent(entry);
}

export async function deleteContent(id: string, actor: Actor) {
  const entry = await ContentEntryModel.findById(id);
  if (!entry) throw new AppError('NOT_FOUND', 'Content was not found', 404);
  await syncMediaUsage({ resourceType: 'content', resourceId: id, field: 'images' }, []);
  await entry.deleteOne();
  await recordAudit({ actorId: actor.id, action: 'content.delete', resourceType: 'content', resourceId: id, ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  return { deleted: true };
}

function presentContent(entry: {
  _id: { toString(): string };
  type: string;
  slug: string;
  title: string;
  summary: string;
  body: unknown;
  imageIds: Array<{ toString(): string }>;
  displayOrder: number;
  publicationStatus: string;
  seo?: { title?: string; description?: string } | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(entry._id),
    type: entry.type,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    imageIds: entry.imageIds.map((id) => String(id)),
    displayOrder: entry.displayOrder,
    publicationStatus: entry.publicationStatus,
    seo: { title: entry.seo?.title ?? '', description: entry.seo?.description ?? '' },
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
