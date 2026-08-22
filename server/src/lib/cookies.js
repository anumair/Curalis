import { env } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';

// Scoped to /api/auth only — the browser never sends this cookie to any
// other route, shrinking its exposure.
const COOKIE_PATH = '/api/auth';

export function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: COOKIE_PATH });
}
