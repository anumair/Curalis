import { verifyAccessToken } from '../lib/jwt.js';
import { ApiError } from '../utils/errors.js';

// Verifies the access token only. Object-level ownership checks (can this
// doctor see this specific appointment?) happen in each module's service,
// not here — this is the coarse "are you logged in" gate.
export function requireAuth(req, res, next) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!token) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    next(new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Invalid or expired access token.'));
  }
}
