import { AppError } from './errors.js';

export async function allocateSlug(requested: string | undefined, name: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const base = requested ?? slugify(name);
  if (!(await exists(base))) return base;
  for (let attempt = 2; attempt <= 30; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new AppError('CONFLICT', 'Could not allocate a unique slug', 409);
}

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!slug) {
    throw new AppError('INVALID_SLUG', 'Unable to generate a URL slug from that name', 400);
  }
  return slug;
}
