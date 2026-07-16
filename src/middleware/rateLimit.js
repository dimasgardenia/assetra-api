/* Rate limiter sederhana in-memory (per IP + rute) — pertahanan pertama
   terhadap penyalahgunaan endpoint yang mengirim email / brute force login.
   Produksi skala besar: ganti dengan store Redis. */

const buckets = new Map();

/* Bersihkan bucket kedaluwarsa tiap 10 menit agar memori tidak tumbuh. */
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

/**
 * @param {object} opts
 * @param {number} opts.windowMs  jendela waktu
 * @param {number} opts.max       maksimal permintaan per jendela
 * @param {string} opts.name      pembeda antar-limiter
 */
export function rateLimit({ windowMs, max, name }) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      const retryAfterSec = Math.ceil((b.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: `Terlalu banyak permintaan — coba lagi dalam ${Math.ceil(retryAfterSec / 60)} menit`,
      });
    }
    next();
  };
}
