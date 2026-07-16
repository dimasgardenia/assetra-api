/* Catches thrown errors / next(err) and returns JSON. */
export function errorHandler(err, req, res, next) {
  console.error('[err]', err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack } : {}),
  });
}

/** Wrap an async route handler so thrown errors propagate to errorHandler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
