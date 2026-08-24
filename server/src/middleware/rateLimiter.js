import rateLimit from 'express-rate-limit';

// Login/register are the only unauthenticated write endpoints that take a
// password guess — everything else behind requireAuth is already gated by
// needing a valid token in the first place. 20 per 15 minutes is still a
// real throttle against brute force (three orders of magnitude below what
// guessing a password needs) while leaving headroom for a legitimate user
// mistyping a few times.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again in a few minutes.' } },
});
