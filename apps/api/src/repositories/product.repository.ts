import { PRODUCT_AVAILABILITY, PUBLICATION_STATUSES } from '@aprotel/shared';
import { ProductModel } from '../models/product.model.js';
import { escapeRegex, pickSort, sortOrder } from '../utils/pagination.js';

export interface ProductQuery {
  page: number;
  pageSize: number;
  sort?: string;
  order: 'asc' | 'desc';
  q?: string;
  category?: string;
  brand?: string;
  availability?: (typeof PRODUCT_AVAILABILITY)[number];
  featured?: 'true' | 'false';
  minPrice?: number;
  maxPrice?: number;
  status?: (typeof PUBLICATION_STATUSES)[number];
  specificationProfile?: string;
}

export function productFilter(query: ProductQuery, visibility: 'public' | 'admin'): Record<string, unknown> {
  const filter: Record<string, unknown> = { deletedAt: null };
  const clauses: Record<string, unknown>[] = [];
  if (visibility === 'public') filter.publicationStatus = 'published';
  else if (query.status) filter.publicationStatus = query.status;
  if (query.category) clauses.push({ $or: [{ categoryId: query.category }, { subcategoryId: query.category }] });
  if (query.brand) filter.brand = new RegExp(`^${escapeRegex(query.brand)}$`, 'i');
  if (query.availability) filter.availability = query.availability;
  if (query.featured) filter.featured = query.featured === 'true';
  if (query.specificationProfile) filter.specificationProfile = query.specificationProfile;
  if (query.minPrice != null || query.maxPrice != null) {
    const price: Record<string, number> = {};
    if (query.minPrice != null) price.$gte = query.minPrice;
    if (query.maxPrice != null) price.$lte = query.maxPrice;
    filter.sellingPriceKobo = price;
  }
  if (query.q) {
    const expression = new RegExp(escapeRegex(query.q), 'i');
    clauses.push({ $or: [{ name: expression }, { sku: expression }, { brand: expression }] });
  }
  if (clauses.length > 0) filter.$and = clauses;
  return filter;
}

export async function queryProducts(query: ProductQuery, visibility: 'public' | 'admin') {
  const filter = productFilter(query, visibility);
  const sortField = pickSort(query.sort === 'price' ? 'sellingPriceKobo' : query.sort, ['name', 'sellingPriceKobo', 'createdAt', 'brand'], 'createdAt');
  const [items, total] = await Promise.all([
    ProductModel.find(filter)
      .sort({ [sortField]: sortOrder(query.order) })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
    ProductModel.countDocuments(filter),
  ]);
  return { items, total };
}
