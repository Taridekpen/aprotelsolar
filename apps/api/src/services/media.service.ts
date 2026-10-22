import mongoose, { type ClientSession, type Types } from 'mongoose';
import sharp from 'sharp';
import type { Env } from '../config/env.js';
import { MediaAssetModel } from '../models/media.model.js';
import { AppError } from '../utils/errors.js';
import { deleteGridFile, mediaBucket, uploadBuffer } from '../utils/gridfs.js';
import { detectImageType, sanitizeFilename } from '../utils/image.js';
import { toObjectId } from '../utils/object-id.js';
import { escapeRegex, pageMeta, pickSort, sortOrder } from '../utils/pagination.js';
import { recordAudit } from './audit.service.js';

interface UsageTarget {
  resourceType: string;
  resourceId: string;
  field: string;
}

export async function uploadMedia(input: {
  env: Env;
  buffer: Buffer;
  filename: string;
  altText: string;
  administratorId: string;
}) {
  const processed = await inspectImage(input.buffer, input.env);
  const safeName = sanitizeFilename(input.filename);
  const uploaded: Types.ObjectId[] = [];
  try {
    const originalId = await uploadBuffer(input.buffer, safeName, processed.mime);
    uploaded.push(originalId);
    const variants = [];
    for (const variant of processed.variants) {
      const fileId = await uploadBuffer(variant.data, `${variant.name}-${safeName}.webp`, 'image/webp');
      uploaded.push(fileId);
      variants.push({
        name: variant.name,
        gridfsFileId: fileId,
        mimeType: 'image/webp',
        width: variant.width,
        height: variant.height,
        size: variant.size,
      });
    }
    const asset = await MediaAssetModel.create({
      originalFilename: safeName,
      mimeType: processed.mime,
      size: input.buffer.length,
      width: processed.width,
      height: processed.height,
      gridfsFileId: originalId,
      variants,
      altText: input.altText,
      uploadedBy: input.administratorId,
      status: 'pending',
      usage: [],
    });
    await recordAudit({
      actorId: input.administratorId,
      action: 'media.upload',
      resourceType: 'media',
      resourceId: String(asset._id),
      metadata: { mimeType: processed.mime, size: input.buffer.length },
    });
    return asset;
  } catch (error) {
    await Promise.all(uploaded.map((id) => deleteGridFile(id).catch(() => undefined)));
    throw error;
  }
}

export async function replaceMedia(id: string, input: { env: Env; buffer: Buffer; filename: string; administratorId: string }) {
  const asset = await MediaAssetModel.findById(id);
  if (!asset) throw new AppError('NOT_FOUND', 'Media was not found', 404);
  const processed = await inspectImage(input.buffer, input.env);
  const safeName = sanitizeFilename(input.filename);
    const previousIds = [asset.gridfsFileId, ...asset.variants.map((variant) => variant.gridfsFileId)].map((fileId) => String(fileId));
  const uploaded: Types.ObjectId[] = [];
  try {
    const originalId = await uploadBuffer(input.buffer, safeName, processed.mime);
    uploaded.push(originalId);
    const variants = [];
    for (const variant of processed.variants) {
      const fileId = await uploadBuffer(variant.data, `${variant.name}-${safeName}.webp`, 'image/webp');
      uploaded.push(fileId);
      variants.push({
        name: variant.name,
        gridfsFileId: fileId,
        mimeType: 'image/webp' as const,
        width: variant.width,
        height: variant.height,
        size: variant.size,
      });
    }
    asset.originalFilename = safeName;
    asset.mimeType = processed.mime;
    asset.size = input.buffer.length;
    asset.width = processed.width;
    asset.height = processed.height;
    asset.set('gridfsFileId', originalId);
    asset.set('variants', variants);
    await asset.save();
    await Promise.all(previousIds.map((fileId) => deleteGridFile(fileId).catch(() => undefined)));
    await recordAudit({
      actorId: input.administratorId,
      action: 'media.replace',
      resourceType: 'media',
      resourceId: String(asset._id),
    });
    return asset;
  } catch (error) {
    await Promise.all(uploaded.map((fileId) => deleteGridFile(fileId).catch(() => undefined)));
    throw error;
  }
}

export async function updateMedia(id: string, altText: string | undefined, administratorId: string) {
  const asset = await MediaAssetModel.findById(id);
  if (!asset) throw new AppError('NOT_FOUND', 'Media was not found', 404);
  if (altText) asset.altText = altText;
  await asset.save();
  await recordAudit({ actorId: administratorId, action: 'media.update', resourceType: 'media', resourceId: id });
  return asset;
}

export async function deleteMedia(id: string, administratorId: string) {
  const asset = await MediaAssetModel.findById(id);
  if (!asset) throw new AppError('NOT_FOUND', 'Media was not found', 404);
  if (asset.usage.length > 0) {
    throw new AppError('MEDIA_IN_USE', 'Remove this image from the records that use it before deleting it', 409, {
      usage: asset.usage,
    });
  }
  await deleteGridFile(asset.gridfsFileId);
  await Promise.all(asset.variants.map((variant) => deleteGridFile(variant.gridfsFileId)));
  await asset.deleteOne();
  await recordAudit({ actorId: administratorId, action: 'media.delete', resourceType: 'media', resourceId: id });
}

export async function listMedia(query: { page: number; pageSize: number; q?: string; sort?: string; order: 'asc' | 'desc' }) {
  const filter: Record<string, unknown> = {};
  if (query.q) filter.originalFilename = new RegExp(escapeRegex(query.q), 'i');
  const sortField = pickSort(query.sort, ['createdAt', 'originalFilename', 'size'], 'createdAt');
  const [items, total] = await Promise.all([
    MediaAssetModel.find(filter)
      .sort({ [sortField]: sortOrder(query.order) })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    MediaAssetModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
}

export async function openPublicMedia(id: string, variant: string | undefined) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new AppError('NOT_FOUND', 'Media was not found', 404);
  const asset = await MediaAssetModel.findById(id);
  if (!asset) throw new AppError('NOT_FOUND', 'Media was not found', 404);
  let fileId = String(asset.gridfsFileId);
  let mimeType = asset.mimeType;
  let size = asset.size;
  if (variant && variant !== 'original') {
    const match = asset.variants.find((item) => item.name === variant);
    if (!match) throw new AppError('NOT_FOUND', 'Image variant was not found', 404);
    fileId = String(match.gridfsFileId);
    mimeType = match.mimeType;
    size = match.size;
  }
  return {
    stream: mediaBucket().openDownloadStream(new mongoose.Types.ObjectId(fileId)),
    mimeType,
    size,
    etag: `"${String(fileId)}"`,
    filename: asset.originalFilename,
  };
}

export async function syncMediaUsage(target: UsageTarget, mediaIds: string[], session?: ClientSession): Promise<void> {
  const uniqueIds = [...new Set(mediaIds)];
  const current = await MediaAssetModel.find({
    usage: { $elemMatch: { resourceType: target.resourceType, resourceId: target.resourceId, field: target.field } },
  }).session(session ?? null);

  for (const asset of current) {
    if (uniqueIds.includes(String(asset._id))) continue;
    asset.set(
      'usage',
      asset.usage.filter((usage) => !(usage.resourceType === target.resourceType && usage.resourceId === target.resourceId && usage.field === target.field)),
    );
    asset.status = asset.usage.length > 0 ? 'attached' : 'pending';
    await asset.save({ session });
  }

  if (uniqueIds.length === 0) return;
  const nextAssets = await MediaAssetModel.find({ _id: { $in: uniqueIds.map((id) => toObjectId(id, 'image')) } }).session(session ?? null);
  if (nextAssets.length !== uniqueIds.length) {
    throw new AppError('MEDIA_NOT_FOUND', 'One or more images were not found', 400);
  }
  for (const asset of nextAssets) {
    const already = asset.usage.some(
      (usage) => usage.resourceType === target.resourceType && usage.resourceId === target.resourceId && usage.field === target.field,
    );
    if (!already) {
      asset.usage.push(target);
    }
    asset.status = 'attached';
    await asset.save({ session });
  }
}

export async function purgeOrphanedMedia(olderThan: Date): Promise<number> {
  const orphans = await MediaAssetModel.find({ status: 'pending', createdAt: { $lt: olderThan }, 'usage.0': { $exists: false } }).limit(100);
  for (const asset of orphans) {
    await deleteGridFile(asset.gridfsFileId);
    await Promise.all(asset.variants.map((variant) => deleteGridFile(variant.gridfsFileId)));
    await asset.deleteOne();
  }
  return orphans.length;
}

export function presentMedia(asset: {
  _id: { toString(): string };
  originalFilename: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  altText: string;
  status: string;
  usage: unknown[];
  variants: Array<{ name: string; width: number; height: number; size: number }>;
  createdAt: Date;
}) {
  const id = String(asset._id);
  return {
    id,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    status: asset.status,
    usage: asset.usage,
    variants: asset.variants.map((variant) => ({ name: variant.name, width: variant.width, height: variant.height, size: variant.size })),
    urls: {
      original: `/api/v1/media/${id}`,
      thumbnail: `/api/v1/media/${id}?variant=thumbnail`,
      medium: `/api/v1/media/${id}?variant=medium`,
    },
    createdAt: asset.createdAt,
  };
}

async function inspectImage(buffer: Buffer, env: Env) {
  if (buffer.length === 0) throw new AppError('MEDIA_INVALID', 'The uploaded file is empty', 400);
  if (buffer.length > env.MEDIA_MAX_BYTES) throw new AppError('MEDIA_INVALID', 'Image exceeds the size limit', 413);
  const detected = detectImageType(buffer);
  if (!detected) throw new AppError('MEDIA_INVALID', 'Upload a JPEG, PNG, or WebP image', 400);

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000, animated: false }).metadata();
  } catch {
    throw new AppError('MEDIA_INVALID', 'The image file could not be read', 400);
  }
  if (!metadata.width || !metadata.height) throw new AppError('MEDIA_INVALID', 'The image dimensions could not be read', 400);
  if (metadata.width > env.MEDIA_MAX_DIMENSION || metadata.height > env.MEDIA_MAX_DIMENSION) {
    throw new AppError('MEDIA_INVALID', 'The image dimensions exceed the configured limit', 400);
  }
  const formatMatches =
    (detected.mime === 'image/jpeg' && metadata.format === 'jpeg') ||
    (detected.mime === 'image/png' && metadata.format === 'png') ||
    (detected.mime === 'image/webp' && metadata.format === 'webp');
  if (!formatMatches) throw new AppError('MEDIA_INVALID', 'The file signature does not match the image contents', 400);

  const source = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000, animated: false });
  const thumbnail = await source.clone().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer({ resolveWithObject: true });
  const medium = await source.clone().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  return {
    mime: detected.mime,
    width: metadata.width,
    height: metadata.height,
    variants: [
      { name: 'thumbnail' as const, data: thumbnail.data, width: thumbnail.info.width, height: thumbnail.info.height, size: thumbnail.data.length },
      { name: 'medium' as const, data: medium.data, width: medium.info.width, height: medium.info.height, size: medium.data.length },
    ],
  };
}
