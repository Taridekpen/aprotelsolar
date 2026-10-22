import type { Response } from 'express';
import { CSRF_COOKIE, SESSION_COOKIE } from '../config/constants.js';
import type { Env } from '../config/env.js';

function baseOptions(env: Env) {
  return {
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
  } as const;
}

export function setAuthCookies(res: Response, env: Env, sessionToken: string, csrfToken: string): void {
  const maxAge = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  res.cookie(SESSION_COOKIE, sessionToken, {
    ...baseOptions(env),
    httpOnly: true,
    maxAge,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...baseOptions(env),
    httpOnly: false,
    maxAge,
  });
}

export function clearAuthCookies(res: Response, env: Env): void {
  res.clearCookie(SESSION_COOKIE, { ...baseOptions(env), httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...baseOptions(env), httpOnly: false });
}
