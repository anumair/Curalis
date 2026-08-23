import { prisma } from '../../lib/prisma.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from '../../lib/jwt.js';
import { hashPassword, comparePassword } from '../../utils/password.js';
import { ApiError } from '../../utils/errors.js';

export async function registerPatient({ email, password, fullName, phone, timezone }) {
  const normalisedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
  if (existing) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
  }

  const passwordHash = await hashPassword(password);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalisedEmail,
          passwordHash,
          fullName,
          phone,
          role: 'PATIENT',
          ...(timezone ? { timezone } : {}),
        },
      });
      await tx.patientProfile.create({ data: { userId: user.id } });
      return user;
    });
  } catch (err) {
    // The findUnique above only catches the common case — two registrations
    // for the same address landing in the same instant both pass it and
    // race to the DB's unique constraint. Give that race the same error
    // code as the pre-check instead of a generic P2002 DUPLICATE.
    if (err.code === 'P2002') {
      throw new ApiError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
    }
    throw err;
  }
}

export async function validateCredentials(email, password) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  return user;
}

// Issues a fresh access+refresh pair and persists the refresh token's hash.
// Used by register, login, and every successful rotation.
export async function issueTokenPair(user, { userAgent, ipAddress } = {}, { touchLastLogin = false } = {}) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, expiresAt: refreshTokenExpiresAt } = signRefreshToken(user);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      userAgent,
      ipAddress,
    },
  });

  if (touchLastLogin) {
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  }

  return { accessToken, refreshToken, refreshTokenExpiresAt, user };
}

// Revokes every active refresh token for a user. Called when a token reuse
// is detected — the schema has no per-device "family" column, so the whole
// family is defined as "every refresh token this user currently holds."
async function revokeAllRefreshTokens(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateRefreshToken(rawToken, meta) {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again.');
  }

  const tokenHash = hashRefreshToken(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) {
    // Correctly signed but unknown to the DB — either stale beyond any
    // record we kept, or fabricated. Treat as a reuse signal for safety.
    if (payload.sub) await revokeAllRefreshTokens(payload.sub);
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again.');
  }

  if (stored.revokedAt) {
    await revokeAllRefreshTokens(stored.userId);
    throw new ApiError(401, 'REFRESH_TOKEN_REUSED', 'Session invalidated for security. Please log in again.');
  }

  if (stored.expiresAt < new Date()) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again.');
  }

  // Atomically claim this token for rotation — the WHERE clause only
  // matches a row still unrevoked at write time. Two concurrent refresh
  // requests presenting the same token both pass the read above (both see
  // revokedAt = null a moment ago); without this conditional write, both
  // would rotate successfully and the reuse-detection guarantee above
  // would never fire. Whichever request loses this race gets count = 0
  // here and is treated exactly like presenting an already-revoked token.
  const claim = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (claim.count === 0) {
    await revokeAllRefreshTokens(stored.userId);
    throw new ApiError(401, 'REFRESH_TOKEN_REUSED', 'Session invalidated for security. Please log in again.');
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again.');
  }

  return issueTokenPair(user, meta);
}

export async function logout(rawToken) {
  if (!rawToken) return;
  const tokenHash = hashRefreshToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserById(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  return user;
}
