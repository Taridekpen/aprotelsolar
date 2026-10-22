export function pageMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export function sortOrder(order: 'asc' | 'desc'): 1 | -1 {
  return order === 'asc' ? 1 : -1;
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pickSort(sort: string | undefined, allowed: readonly string[], fallback: string): string {
  if (!sort || !allowed.includes(sort)) return fallback;
  return sort;
}
