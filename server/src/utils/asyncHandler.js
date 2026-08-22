// Express 4 does not catch rejected promises from async handlers on its
// own. Wrapping a route with this forwards any thrown/rejected error to
// errorHandler instead of hanging the request.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
