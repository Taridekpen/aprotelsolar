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

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
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

type Options = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit | null; retry?: boolean };

export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${suffix}` : suffix;
}

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();
  if (options.json !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      method,
      credentials: 'include',
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
  } catch {
    throw new ApiError({ status: 0, code: 'NETWORK', message: 'The administration API could not be reached.' });
  }
  if (response.status === 403 && !options.retry) {
    const error = await readFailure(response);
    if (error.code === 'CSRF_FAILED') {
      await refreshCsrf();
      return request(path, { ...options, retry: true });
    }
    throw error;
  }
  if (!response.ok) throw await readFailure(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function refreshCsrf() {
  const payload = await request<{ data: { csrfToken: string } }>('/api/v1/auth/csrf');
  setCsrfToken(payload.data.csrfToken);
  return payload.data.csrfToken;
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

export async function downloadFile(path: string, filename: string) {
  const response = await fetch(apiUrl(path), { credentials: 'include' });
  if (!response.ok) throw await readFailure(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function uploadFile(path: string, file: File, fields: Record<string, string>, onProgress: (ratio: number) => void, method = 'POST') {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, apiUrl(path));
    xhr.withCredentials = true;
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || '{}') as { data?: unknown; error?: { code?: string; message?: string; details?: ApiFailure['details'] } };
      if (xhr.status >= 200 && xhr.status < 300) resolve(body.data);
      else {
        reject(new ApiError({ status: xhr.status, code: body.error?.code ?? 'REQUEST_FAILED', message: body.error?.message ?? 'Upload failed.', details: body.error?.details }));
      }
    };
    xhr.onerror = () => reject(new ApiError({ status: 0, code: 'NETWORK', message: 'The upload could not be completed.' }));
    const body = new FormData();
    body.set('file', file);
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    xhr.send(body);
  });
}
