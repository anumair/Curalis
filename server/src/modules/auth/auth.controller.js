import * as authService from './auth.service.js';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_NAME } from '../../lib/cookies.js';
import { ApiError } from '../../utils/errors.js';
import { toPublicUser } from '../../utils/serializers.js';

function requestMeta(req) {
  return { userAgent: req.get('user-agent') ?? undefined, ipAddress: req.ip };
}

export async function register(req, res) {
  const user = await authService.registerPatient(req.body);
  const { accessToken, refreshToken, refreshTokenExpiresAt } = await authService.issueTokenPair(
    user,
    requestMeta(req)
  );
  setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
  res.status(201).json({ accessToken, user: toPublicUser(user) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await authService.validateCredentials(email, password);
  const { accessToken, refreshToken, refreshTokenExpiresAt } = await authService.issueTokenPair(
    user,
    requestMeta(req),
    { touchLastLogin: true }
  );
  setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
  res.json({ accessToken, user: toPublicUser(user) });
}

export async function refresh(req, res) {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawToken) {
    throw new ApiError(401, 'NO_REFRESH_TOKEN', 'Not authenticated.');
  }

  const { accessToken, refreshToken, refreshTokenExpiresAt, user } = await authService.rotateRefreshToken(
    rawToken,
    requestMeta(req)
  );
  setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
  res.json({ accessToken, user: toPublicUser(user) });
}

export async function logout(req, res) {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  await authService.logout(rawToken);
  clearRefreshCookie(res);
  res.status(204).send();
}

export async function me(req, res) {
  const user = await authService.getUserById(req.user.id);
  const response = toPublicUser(user);
  if (user.patientProfile) {
    const { dateOfBirth, gender, bloodGroup, medicationRemindersEnabled } = user.patientProfile;
    response.patientProfile = { dateOfBirth, gender, bloodGroup, medicationRemindersEnabled };
  }
  res.json({ user: response });
}
