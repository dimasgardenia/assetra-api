/* Catches thrown errors / next(err) and returns JSON. */
export function errorHandler(err, req, res, next) {
  console.error('[err]', err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  /* Stack trace hanya ke log server, tidak pernah ke klien. */
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed') });
}

/** Wrap an async route handler so thrown errors propagate to errorHandler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
