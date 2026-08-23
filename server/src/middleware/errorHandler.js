import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/errors.js';

// Raw Postgres SQLSTATEs. Only surfaces on err.meta.code, and only for
// errors Prisma passes through from $queryRaw/$executeRaw (wrapped as its
// own P2010 with the real SQLSTATE nested in .meta.code) — e.g. the
// appointments exclusion-constraint violation.
const PG_SQLSTATE_MAP = {
  '23P01': { status: 409, code: 'SLOT_NO_LONGER_AVAILABLE', message: 'That slot was just booked. Please pick another.' },
  '23505': { status: 409, code: 'DUPLICATE', message: 'That record already exists.' },
  '23503': { status: 400, code: 'INVALID_REFERENCE', message: 'Referenced record does not exist.' },
  '23514': { status: 422, code: 'INVALID_INPUT', message: 'Input failed a database constraint.' },
};

// Prisma's own error codes, thrown directly by typed calls like
// create()/update() — these are NOT raw SQLSTATEs. A duplicate-email race
// that slips past a service's pre-check (two registrations for the same
// address landing within the same instant) surfaces as P2002 here, not
// 23505 above.
const PRISMA_CODE_MAP = {
  P2002: { status: 409, code: 'DUPLICATE', message: 'That record already exists.' },
  P2003: { status: 400, code: 'INVALID_REFERENCE', message: 'Referenced record does not exist.' },
  P2025: { status: 404, code: 'NOT_FOUND', message: 'Record not found.' },
};

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? {} },
    });
  }

  const sqlState = err?.meta?.code;
  const pgMapped = sqlState && PG_SQLSTATE_MAP[sqlState];
  if (pgMapped) {
    return res.status(pgMapped.status).json({
      error: { code: pgMapped.code, message: pgMapped.message, details: {} },
    });
  }

  const prismaMapped = err?.code && PRISMA_CODE_MAP[err.code];
  if (prismaMapped) {
    return res.status(prismaMapped.status).json({
      error: { code: prismaMapped.code, message: prismaMapped.message, details: {} },
    });
  }

  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.', details: {} },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found.', details: {} },
  });
}
