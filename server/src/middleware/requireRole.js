import { ApiError } from '../utils/errors.js';

// Coarse role gate — must run after requireAuth. Not a substitute for the
// per-record ownership checks each service performs.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    next();
  };
}
