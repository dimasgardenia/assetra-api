# Assetra API

Backend Express + SQLite (better-sqlite3) untuk Assetra Bidding Platform.

## Struktur MVC

```
src/
├── models/        — Akses DB (one file per entity)
├── controllers/   — Business logic
├── routes/        — Express endpoint mappings
├── middleware/    — auth, role guards, error handler
├── db/            — schema.sql, init.js, seed.js
├── utils/         — JWT, password, pagination
├── config/        — env loader, db connection
├── app.js         — Express setup
└── server.js      — entry point
data/assetra.db    — SQLite database (auto-created)
uploads/photos/    — uploaded photos (served at /files/photos/…)
uploads/docs/      — uploaded documents (served at /files/docs/…)
```

## Setup pertama kali

```bash
npm install
npm run seed       # buat tabel + seed admin/bidder + 6 listings demo
npm run dev        # node --watch (auto-reload)
# atau
npm start
```

Server listen di `http://localhost:3001`.

## Demo accounts (seeded)

| Email | Password | Role |
|---|---|---|
| `admin@assetra.co.id` | `admin123` | admin |
| `bidder@assetra.co.id` | `bidder123` | bidder |

## Reset DB

```bash
npm run reset       # rm data/assetra.db && re-seed
```

## API endpoints

### Auth (`/api/auth`)
- `POST /register` — `{ email, password, name?, accountType? }` → `{ user, token }`
- `POST /login` — `{ email, password }` → `{ user, token }`
- `POST /google` — `{ email, name?, picture?, sub? }` → `{ user, token }` (SSO callback)
- `GET /me` — current user (requires Bearer token)

### Listings (`/api/listings`)
- `GET /` — paginated. Query: `page`, `per_page`, `type`, `region`, `verif_level`, `q`, `status`
- `GET /:id` — get one
- `POST /` — **admin only** — create listing
- `PUT /:id` — admin only — update
- `DELETE /:id` — admin only

### Bids
- `GET /api/listings/:id/bids` — public
- `POST /api/listings/:id/bids` — `{ amount }` — auth required
- `GET /api/bids/mine` — current user's bid history

### Photos
- `POST /api/listings/:id/photos` — admin — multipart `photos[]` (up to 24, 15 MB each)
- `DELETE /api/listings/:id/photos/:photoId` — admin
- `POST /api/listings/:id/photos/reorder` — `{ ids: [...] }`

### Documents
- `POST /api/listings/:id/documents/:slot` — admin — multipart `file` (30 MB max)
- `DELETE /api/listings/:id/documents/:slot` — admin

### Watchlist (auth required)
- `GET /api/watchlist`
- `POST /api/watchlist/:listingId`
- `DELETE /api/watchlist/:listingId`

### Admin (`/api/admin`, admin role)
- `GET /stats` — KPI dashboard
- `GET /kyc` — all KYC submissions
- `GET /kyc/pending` — only pending
- `POST /kyc/:id/approve`
- `POST /kyc/:id/reject`
- `GET /documents` — flat list (Media Library)

### Static files
- `GET /files/photos/...`
- `GET /files/docs/...`

## Environment vars (`.env`)

```
PORT=3001
JWT_SECRET=...               # ganti untuk production!
JWT_EXPIRES_IN=7d
DB_PATH=./data/assetra.db
UPLOAD_DIR=./uploads
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

## Satu layanan: API + frontend dari origin yang sama

Set `WEB_DIST=./web-dist` agar API juga menyajikan hasil build `assetra-web` (SPA fallback ke
`index.html`, `/api/*` dan `/files/*` tetap ke backend). `scripts/build-web.sh` meng-clone
dan mem-build frontend ke `./web-dist` dengan `VITE_API_BASE` kosong (same-origin).

```bash
bash scripts/build-web.sh          # WEB_BRANCH=<branch> untuk memilih branch frontend
WEB_DIST=./web-dist npm start      # buka http://localhost:3001
```

### Deploy gratis ke Render (bisa dari HP)

`render.yaml` mendefinisikan satu web service free-tier yang menjalankan build di atas.
1. Buka `https://dashboard.render.com`, login dengan GitHub.
2. **New → Blueprint** → pilih repo `assetra-api` → pilih branch → **Apply**.
3. Setelah build (±3 menit) buka `https://<nama-service>.onrender.com` di Chrome HP.

Catatan free tier: service tidur setelah ±15 menit idle (request pertama lambat) dan disk
tidak persisten, jadi database SQLite dan upload di-reset setiap deploy/restart
(`startCommand` men-seed ulang akun demo).
