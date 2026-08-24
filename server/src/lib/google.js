import { google } from 'googleapis';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

// getGoogleAccountEmail (right after consent, to label the connection with
// the Google account's address) calls Google's userinfo endpoint, which
// requires an identity scope on the token — calendar.events alone doesn't
// authorize it. Without this, the userinfo call 401s with Google's generic
// "missing required authentication credential" message, which reads like a
// propagation bug but is really just an insufficient-scope token hitting an
// endpoint it was never authorized for.
const CONSENT_SCOPES = [...CALENDAR_SCOPES, 'https://www.googleapis.com/auth/userinfo.email'];

export function createOAuth2Client() {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

export function getGoogleAuthUrl(state) {
  return createOAuth2Client().generateAuthUrl({
    // Both required together, or Google omits the refresh token and the
    // connection dies in an hour with no way to renew (brief §14).
    access_type: 'offline',
    prompt: 'consent',
    scope: CONSENT_SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code) {
  const { tokens } = await createOAuth2Client().getToken(code);
  return tokens;
}

export async function getGoogleAccountEmail(accessToken) {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  const { data } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
  return data.email;
}

// Returns an OAuth2Client seeded with the decrypted refresh token —
// googleapis' own request pipeline auto-refreshes the access token as
// needed for any call made through this client.
export function getAuthorizedClient(encryptedRefreshToken) {
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: decryptRefreshToken(encryptedRefreshToken) });
  return client;
}

export function getCalendarClient(encryptedRefreshToken) {
  return google.calendar({ version: 'v3', auth: getAuthorizedClient(encryptedRefreshToken) });
}

// AES-256-GCM, stored as "iv:authTag:ciphertext" (all base64) — brief
// §14. Never in the JWT, never in logs.
const ALGORITHM = 'aes-256-gcm';

export function encryptRefreshToken(plainText) {
  const key = Buffer.from(env.CALENDAR_TOKEN_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptRefreshToken(encrypted) {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(':');
  const key = Buffer.from(env.CALENDAR_TOKEN_KEY, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8');
}

// Deterministic per (appointment, participant) so a timed-out retry can't
// create a duplicate event — Google requires base32hex (a-v, 0-9),
// 5-1024 chars. Brief §14's exact algorithm: hex digest, each nibble
// remapped by its position in the hex alphabet onto the base32hex one
// (a length-preserving substitution, not a real base-conversion).
export function buildCalendarEventId(appointmentId, userId) {
  const hexAlphabet = '0123456789abcdef';
  const targetAlphabet = 'abcdefghijklmnopqrstuv0123456789';
  return crypto
    .createHash('sha1')
    .update(`${appointmentId}:${userId}`)
    .digest('hex')
    .split('')
    .map((c) => targetAlphabet[hexAlphabet.indexOf(c)])
    .join('');
}
