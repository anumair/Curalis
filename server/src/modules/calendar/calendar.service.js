import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { signCalendarStateToken, verifyCalendarStateToken } from '../../lib/jwt.js';
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleAccountEmail,
  getAuthorizedClient,
  encryptRefreshToken,
  CALENDAR_SCOPES,
} from '../../lib/google.js';

// Login and calendar authorization are completely separate flows (brief
// §14 — no Google Sign-In). This only ever runs for an already-
// authenticated user clicking "Connect" from Settings.
export function getConnectUrl(userId) {
  const state = signCalendarStateToken(userId);
  return getGoogleAuthUrl(state);
}

export async function handleCallback({ code, state, error }) {
  if (error || !code || !state) {
    return { redirectUrl: `${env.CLIENT_BASE_URL}/settings?calendar=denied` };
  }

  let userId;
  try {
    userId = verifyCalendarStateToken(state);
  } catch {
    return { redirectUrl: `${env.CLIENT_BASE_URL}/settings?calendar=invalid_state` };
  }

  // This whole section is a real network round-trip to Google that can
  // fail for reasons outside our control (expired/reused code, transient
  // network error). The callback's contract is "always end in a browser
  // redirect" — letting an error escape here would instead hand the user
  // a raw JSON error page mid-OAuth-flow, which is much worse UX than a
  // redirect saying the connection failed.
  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google only issues a refresh token on the first consent, or when
      // prompt=consent forces re-consent — since we always request
      // prompt=consent (brief §14), this should be rare; happens if the
      // user has an existing grant Google decided not to refresh here.
      logger.warn({ userId }, 'Google OAuth callback returned no refresh token');
      return { redirectUrl: `${env.CLIENT_BASE_URL}/settings?calendar=no_refresh_token` };
    }

    const googleEmail = await getGoogleAccountEmail(tokens.access_token);
    const encryptedRefreshToken = encryptRefreshToken(tokens.refresh_token);

    await prisma.calendarConnection.upsert({
      where: { userId },
      create: {
        userId,
        encryptedRefreshToken,
        grantedScopes: tokens.scope ?? CALENDAR_SCOPES.join(' '),
        googleEmail,
      },
      update: {
        encryptedRefreshToken,
        grantedScopes: tokens.scope ?? CALENDAR_SCOPES.join(' '),
        googleEmail,
        revokedAt: null,
        lastError: null,
        connectedAt: new Date(),
      },
    });

    return { redirectUrl: `${env.CLIENT_BASE_URL}/settings?calendar=connected` };
  } catch (err) {
    logger.error({ err, userId }, 'Google Calendar connect failed during token exchange');
    return { redirectUrl: `${env.CLIENT_BASE_URL}/settings?calendar=error` };
  }
}

export async function disconnect(userId) {
  const connection = await prisma.calendarConnection.findUnique({ where: { userId } });
  if (!connection) return; // already disconnected — idempotent

  try {
    const client = getAuthorizedClient(connection.encryptedRefreshToken);
    await client.revokeToken(client.credentials.refresh_token);
  } catch (err) {
    // Best-effort — Google may already consider it revoked (e.g. the user
    // revoked it from their own Google Account settings). Remove our
    // local record regardless; there's nothing else useful to do with a
    // token we can no longer use anyway.
    logger.warn({ err, userId }, 'Failed to revoke Google token on disconnect (removing local record anyway)');
  }

  await prisma.calendarConnection.delete({ where: { userId } });
}

export async function getStatus(userId) {
  const connection = await prisma.calendarConnection.findUnique({ where: { userId } });
  if (!connection) return { connected: false, googleEmail: null, revoked: false };
  return { connected: !connection.revokedAt, googleEmail: connection.googleEmail, revoked: Boolean(connection.revokedAt) };
}
