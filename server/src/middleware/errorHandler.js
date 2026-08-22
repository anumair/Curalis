import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/errors.js';

// Maps Postgres SQLSTATE codes (surfaced by Prisma as err.meta.code, or
// thrown directly by raw queries) to the HTTP/error envelope shape used
// across the API. Extended as each module needs it.
const PG_SQLSTATE_MAP = {
  '23P01': { status: 409, code: 'SLOT_NO_LONGER_AVAILABLE', message: 'That slot was just booked. Please pick another.' },
  '23505': { status: 409, code: 'DUPLICATE', message: 'That record already exists.' },
  '23503': { status: 400, code: 'INVALID_REFERENCE', message: 'Referenced record does not exist.' },
  '23514': { status: 422, code: 'INVALID_INPUT', message: 'Input failed a database constraint.' },
};

function sqlStateOf(err) {
  return err?.meta?.code ?? err?.code ?? undefined;
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? {} },
    });
  }

  const sqlState = sqlStateOf(err);
  const mapped = sqlState && PG_SQLSTATE_MAP[sqlState];
  if (mapped) {
    return res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message, details: {} },
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
