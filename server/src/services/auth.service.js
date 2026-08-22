import { prisma } from '../lib/prisma.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from '../lib/jwt.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { ApiError } from '../utils/errors.js';

export async function registerPatient({ email, password, fullName, phone, timezone }) {
  const normalisedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
  if (existing) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
  }

  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
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

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again.');
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

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
