import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

// jti makes every issued refresh token unique even if two were requested
// within the same second, so tokenHash never collides in the DB.
export function signRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000) };
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
}

// The raw JWT is never stored — only its hash, so a DB read alone can't
// produce a usable token.
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Carries the initiating user's id through Google's OAuth round-trip via
// the `state` parameter. The callback is a raw browser redirect FROM
// Google — there's no Authorization header to read there, so this is the
// only tamper-proof way to know who a given /callback hit belongs to.
// Short-lived: the whole consent flow should take well under 10 minutes.
export function signCalendarStateToken(userId) {
  return jwt.sign({ sub: userId, purpose: 'calendar_state' }, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
}

export function verifyCalendarStateToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  if (payload.purpose !== 'calendar_state') {
    throw new Error('Invalid state token purpose');
  }
  return payload.sub;
}
