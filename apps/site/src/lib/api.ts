export type PageMeta = { page: number; pageSize: number; total: number; pageCount: number };

export type ApiFailure = {
  status: number;
  code: string;
  message: string;
  details?: Array<{ path?: string; message: string }>;
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ApiFailure['details'];

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.status = failure.status;
    this.code = failure.code;
    this.details = failure.details;
  }
}

async function readFailure(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: ApiFailure['details'] } } | null;
  return new ApiError({
    status: response.status,
    code: body?.error?.code ?? 'REQUEST_FAILED',
    message: body?.error?.message ?? 'The request could not be completed.',
    details: body?.error?.details,
  });
}

type Options = Omit<RequestInit, 'body'> & { json?: unknown; idempotencyKey?: string };

export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${suffix}` : suffix;
}

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.json !== undefined) headers.set('Content-Type', 'application/json');
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      credentials: 'omit',
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
    });
  } catch {
    throw new ApiError({ status: 0, code: 'NETWORK', message: 'Aprotel Solar could not be reached. Try again shortly.' });
  }
  if (!response.ok) throw await readFailure(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function api<T>(path: string, options?: Options): Promise<T> {
  const payload = await request<{ data: T }>(path, options);
  return payload.data;
}

export async function apiList<T>(path: string): Promise<{ items: T[]; meta: PageMeta }> {
  const payload = await request<{ data: T[]; meta: PageMeta }>(path);
  return { items: payload.data, meta: payload.meta };
}

export function queryString(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
