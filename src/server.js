import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => {
  console.log(`[assetra-api] listening on http://localhost:${env.PORT}`);
  console.log(`[assetra-api] DB: ${env.DB_PATH}`);
  console.log(`[assetra-api] CORS origins: ${env.CORS_ORIGIN.join(', ')}`);
});
