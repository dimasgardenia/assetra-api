import { app } from './app.js';
import { env } from './config/env.js';

const DEFAULT_SECRET = 'dev-secret-change-me';
if (env.JWT_SECRET === DEFAULT_SECRET || env.JWT_SECRET.length < 16) {
  if (env.NODE_ENV === 'production') {
    console.error('[assetra-api] FATAL: JWT_SECRET belum diisi / terlalu pendek. Set JWT_SECRET (min. 16 karakter acak) sebelum menjalankan di production.');
    process.exit(1);
  }
  console.warn('[assetra-api] WARNING: JWT_SECRET memakai nilai default — hanya untuk development.');
}

app.listen(env.PORT, () => {
  console.log(`[assetra-api] listening on http://localhost:${env.PORT}`);
  console.log(`[assetra-api] DB: ${env.DB_PATH}`);
  console.log(`[assetra-api] CORS origins: ${env.CORS_ORIGIN.join(', ')}`);
});
