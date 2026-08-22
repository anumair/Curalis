import { ApiError } from '../utils/errors.js';

// Parses req[source] against a Zod schema, replacing it with the parsed
// (coerced/defaulted) value on success. On failure, forwards a 422 with
// field-level details — the shape the brief's error envelope expects.
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', result.error.flatten().fieldErrors)
      );
    }
    req[source] = result.data;
    next();
  };
}
