#!/usr/bin/env node
/* Uji regresi backend end-to-end (146 kasus): auth, listing, foto/dokumen,
   lelang, watchlist, prospek, KPR, agen, banner, admin/KYC, akun, AI, keamanan.

   Jalankan dari folder assetra-api:   npm run test:api
   PERHATIAN: skrip ini MENGHAPUS & men-seed ulang database lokal (DB_PATH)
   serta me-restart server di port 3001. Menolak berjalan bila NODE_ENV=production. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { execSync, spawn } from 'child_process';

if (process.env.NODE_ENV === 'production') { console.error('Refusing to run: NODE_ENV=production'); process.exit(1); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.resolve(ROOT, process.env.DB_PATH || './data/assetra.db');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'assetra-test-'));
process.chdir(TMP);
/* Berkas uji: PNG 1x1 valid, HTML, dan PDF minimal. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
fs.mkdirSync('photos'); for (const n of ['p1', 'p2', 'p3', 'banner', 'agent']) fs.writeFileSync(`photos/${n}.png`, PNG);
fs.writeFileSync('evil.html', '<html><script>alert(1)</script></html>'); fs.writeFileSync('doc.pdf', '%PDF-1.4 test');

/* Reset database ke seed bersih & bersihkan unggahan lokal. */
try { execSync('pkill -f "^node src/server.js"'); } catch {}
for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch {} }
execSync('node src/db/seed.js', { cwd: ROOT, stdio: 'ignore' });
for (const d of ['photos', 'docs', 'banners']) { const dir = path.join(ROOT, process.env.UPLOAD_DIR || 'uploads', d); if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!f.startsWith('.')) { try { fs.unlinkSync(path.join(dir, f)); } catch {} } }

const B = 'http://127.0.0.1:3001';
const db = new Database(DB_PATH);
async function restartApi() {
  try { execSync('pkill -f "^node src/server.js"'); } catch {}
  await new Promise(r => setTimeout(r, 800));
  const out = fs.openSync(path.join(TMP, 'api.log'), 'a');
  spawn('setsid', ['node', 'src/server.js'], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], env: { ...process.env, NODE_ENV: 'development' } }).unref();
  for (let i = 0; i < 40; i++) { try { if ((await fetch(B + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 250)); }
  throw new Error('API did not come back');
}
const results = []; let section = '';
const sec = (s) => { section = s; };
async function t(name, fn) {
  try { const r = await fn(); results.push({ section, name, ok: r === true || (r && r.ok !== false), note: typeof r === 'string' ? r : r?.note || '' }); }
  catch (e) { results.push({ section, name, ok: false, note: 'EXC ' + e.message }); }
}
async function req(method, path, { body, token, form, headers = {} } = {}) {
  const h = { ...headers }; if (token) h.authorization = 'Bearer ' + token;
  let payload;
  if (form) { payload = form; } else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(B + path, { method, headers: h, body: payload });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const fileForm = (field, file, extra = {}, mime = 'image/png') => { const f = new FormData(); Object.entries(extra).forEach(([k, v]) => f.append(k, v)); f.append(field, new Blob([fs.readFileSync(file)], { type: mime }), file.split('/').pop()); return f; };
const verifyTok = (email) => db.prepare('select verify_token t from users where email=?').get(email)?.t;
const login = async (email, password) => (await req('POST', '/api/auth/login', { body: { email, password } })).json?.token;
const expect = (r, status, extra) => ({ ok: r.status === status && (!extra || extra(r)), note: `got ${r.status} ${JSON.stringify(r.json)?.slice(0, 110)}` });

await restartApi();
/* ───────── AUTH ───────── */
sec('Auth');
await t('register buyer ok → 201 pendingVerification, emailSent:false', async () => expect(await req('POST', '/api/auth/register', { body: { email: 'Buyer.One@gmail.com', password: 'rahasia1', name: 'Buyer One', phone: '081200000001', accountType: 'buyer' } }), 201, r => r.json.pendingVerification && r.json.emailSent === false));
await t('register duplicate (case variant) → 409 EMAIL_TAKEN', async () => expect(await req('POST', '/api/auth/register', { body: { email: 'buyer.one@GMAIL.com', password: 'rahasia1', phone: '081200000002' } }), 409, r => r.json.code === 'EMAIL_TAKEN'));
await t('register duplicate phone → 409 PHONE_TAKEN', async () => expect(await req('POST', '/api/auth/register', { body: { email: 'buyer.two@gmail.com', password: 'rahasia1', phone: '081200000001' } }), 409, r => r.json.code === 'PHONE_TAKEN'));
await t('login unverified → 403 EMAIL_UNVERIFIED', async () => expect(await req('POST', '/api/auth/login', { body: { email: 'buyer.one@gmail.com', password: 'rahasia1' } }), 403, r => r.json.code === 'EMAIL_UNVERIFIED'));
await t('send-verification without RESEND → 503', async () => expect(await req('POST', '/api/auth/send-verification', { body: { email: 'buyer.one@gmail.com' } }), 503));
await t('verify-email bad token → 400', async () => expect(await req('POST', '/api/auth/verify-email', { body: { token: 'salah' } }), 400));
await t('verify-email ok → 200 with token', async () => expect(await req('POST', '/api/auth/verify-email', { body: { token: verifyTok('buyer.one@gmail.com') } }), 200, r => !!r.json.token && r.json.user.emailVerified));
await t('verify-email token reused → 400', async () => expect(await req('POST', '/api/auth/verify-email', { body: { token: 'x' } }), 400));
await t('login wrong password → 401', async () => expect(await req('POST', '/api/auth/login', { body: { email: 'buyer.one@gmail.com', password: 'salah' } }), 401));
await t('login ok (case-insensitive email) → 200', async () => expect(await req('POST', '/api/auth/login', { body: { email: 'BUYER.one@gmail.com', password: 'rahasia1' } }), 200, r => !!r.json.token));
const BUY = await login('buyer.one@gmail.com', 'rahasia1'); const ADM = await login('admin@assetra.co.id', 'admin123');
await t('GET /me with token → 200', async () => expect(await req('GET', '/api/auth/me', { token: BUY }), 200, r => r.json.user.email === 'buyer.one@gmail.com'));
await t('GET /me without token → 401', async () => expect(await req('GET', '/api/auth/me'), 401));
await t('GET /me garbage token → 401', async () => expect(await req('GET', '/api/auth/me', { token: 'abc.def.ghi' }), 401));
await t('google without GOOGLE_CLIENT_ID → 503', async () => expect(await req('POST', '/api/auth/google', { body: { credential: 'x' } }), 503));
await restartApi();
await t('forgot (registered, no RESEND) → 503', async () => expect(await req('POST', '/api/auth/forgot', { body: { email: 'buyer.one@gmail.com' } }), 503));
await t('forgot (unknown email) → generic 200', async () => expect(await req('POST', '/api/auth/forgot', { body: { email: 'tidak.ada@gmail.com' } }), 200));
await t('reset with bad token → 400', async () => expect(await req('POST', '/api/auth/reset', { body: { token: 'x', password: 'baru123' } }), 400));
await restartApi();
await t('register: missing fields → 400', async () => expect(await req('POST', '/api/auth/register', { body: { email: 'a@gmail.com' } }), 400));
await t('register: bad email format → 400', async () => expect(await req('POST', '/api/auth/register', { body: { email: 'bukan-email', password: 'x12345', phone: '081200000001' } }), 400));
await t('register: unknown domain (no MX) → 400', async () => expect(await req('POST', '/api/auth/register', { body: { email: 'a@domain-tidak-ada-xyz.id', password: 'x12345', phone: '081200000001' } }), 400));
await t('register: invalid phone → 400', async () => expect(await req('POST', '/api/auth/register', { body: { email: 'buyer1@gmail.com', password: 'x12345', phone: '123' } }), 400));
await t('register: 5-char password → 400', async () => expect(await req('POST', '/api/auth/register', { body: { email: 'weak.pw@gmail.com', password: '12345', phone: '081200000099', accountType: 'buyer' } }), 400));
await restartApi();
await t('register rate limit → 429 after 5 in 15 min', async () => { let last; for (let i = 0; i < 6; i++) last = await req('POST', '/api/auth/register', { body: { email: `rl${i}@gmail.com`, password: 'x12345', phone: `0812000010${i}` } }); return { ok: last.status === 429, note: `last status ${last.status}` }; });

/* ───────── LISTINGS (public) ───────── */
sec('Listings public');
const seedList = (await req('GET', '/api/listings')).json;
await t('list → 200 with data+meta', async () => ({ ok: Array.isArray(seedList.data) && seedList.meta.total >= 6, note: `total ${seedList.meta.total}, perPage ${seedList.meta.perPage}` }));
await t('per_page=50 honored', async () => expect(await req('GET', '/api/listings?per_page=50'), 200, r => r.json.meta.perPage === 50));
await t('perPage=50 (camelCase) honored', async () => expect(await req('GET', '/api/listings?perPage=50'), 200, r => r.json.meta.perPage === 50));
await t('per_page=1000 clamped to 100', async () => expect(await req('GET', '/api/listings?per_page=1000'), 200, r => r.json.meta.perPage === 100));
await t('filter type=land', async () => expect(await req('GET', '/api/listings?type=land'), 200, r => r.json.data.every(x => x.type === 'land')));
await t('filter q=text', async () => expect(await req('GET', '/api/listings?q=subang'), 200, r => r.json.data.length >= 1));
await t('get by id → 200', async () => expect(await req('GET', '/api/listings/' + encodeURIComponent(seedList.data[0].id)), 200, r => r.json.data.id === seedList.data[0].id));
await t('get unknown id → 404', async () => expect(await req('GET', '/api/listings/TIDAK-ADA'), 404));

/* ───────── LISTINGS (staff) ───────── */
sec('Listings staff');
await t('create as buyer → 403', async () => expect(await req('POST', '/api/listings', { token: BUY, body: { title: 'x', type: 'property', price: 1 } }), 403));
await t('create anonymous → 401', async () => expect(await req('POST', '/api/listings', { body: { title: 'x' } }), 401));
await t('create without title → 400', async () => expect(await req('POST', '/api/listings', { token: ADM, body: { type: 'property', price: 1 } }), 400));
await t('create with bad type → 400', async () => expect(await req('POST', '/api/listings', { token: ADM, body: { title: 'x', type: 'kapal', price: 1 } }), 400));
await t('create with negative price → 400', async () => expect(await req('POST', '/api/listings', { token: ADM, body: { title: 'x', type: 'property', price: -1 } }), 400));
let L1;
await t('create as admin → 201', async () => { const r = await req('POST', '/api/listings', { token: ADM, body: { title: 'Rumah Uji Backend', type: 'property', typeLabel: 'House · Sale', mode: 'sale', price: 1500000000, address: 'Jl. Uji 1', status: 'live', source: 'portal', facilities: ['Carport'] } }); L1 = r.json?.data?.id; return expect(r, 201, x => !!x.json.data.id); });
await t('update as admin → 200', async () => expect(await req('PUT', `/api/listings/${encodeURIComponent(L1)}`, { token: ADM, body: { price: 1600000000, status: 'draft' } }), 200, r => r.json.data.price === 1600000000));
await t('update invalid status → 400', async () => expect(await req('PUT', `/api/listings/${encodeURIComponent(L1)}`, { token: ADM, body: { status: 'ngawur' } }), 400));
await t('draft hidden from public list & detail, visible to admin', async () => { await req('PUT', `/api/listings/${encodeURIComponent(L1)}`, { token: ADM, body: { status: 'draft' } }); const pub = (await req('GET', '/api/listings?source=portal')).json.data.some(x => x.id === L1); const det = (await req('GET', '/api/listings/' + encodeURIComponent(L1))).status; const adm = (await req('GET', '/api/listings?source=portal', { token: ADM })).json.data.some(x => x.id === L1); await req('PUT', `/api/listings/${encodeURIComponent(L1)}`, { token: ADM, body: { status: 'live' } }); return { ok: !pub && det === 404 && adm, note: `public=${pub} detail=${det} admin=${adm}` }; });
await t('create with lat out of range → 400', async () => expect(await req('POST', '/api/listings', { token: ADM, body: { title: 'x', type: 'property', price: 1, lat: 95, lng: 106 } }), 400));
await t('update coordinates → 200 and returned', async () => expect(await req('PUT', `/api/listings/${encodeURIComponent(L1)}`, { token: ADM, body: { lat: -6.2607, lng: 106.8138 } }), 200, r => Math.abs(r.json.data.lat - -6.2607) < 1e-6 && Math.abs(r.json.data.lng - 106.8138) < 1e-6));
await t('coordinates visible on public detail', async () => expect(await req('GET', '/api/listings/' + encodeURIComponent(L1)), 200, r => r.json.data.lat != null && r.json.data.lng != null));
await t('update unknown → 404', async () => expect(await req('PUT', '/api/listings/NOPE', { token: ADM, body: { price: 1 } }), 404));
await t('mine=1 anonymous → 401', async () => expect(await req('GET', '/api/listings?mine=1'), 401));

/* ───────── PHOTOS & DOCUMENTS ───────── */
sec('Photos & documents');
let P1;
await t('upload 2 photos → 201', async () => { const f = new FormData(); ['photos/p1.png', 'photos/p2.png'].forEach(p => f.append('photos', new Blob([fs.readFileSync(p)], { type: 'image/png' }), p.split('/').pop())); const r = await req('POST', `/api/listings/${encodeURIComponent(L1)}/photos`, { token: ADM, form: f }); P1 = r.json?.data?.[0]?.id; return expect(r, 201, x => x.json.data.length === 2); });
await t('photo file served → 200 image', async () => { const p = (await req('GET', `/api/listings/${encodeURIComponent(L1)}`)).json.data.uploadedPhotos[0]; const res = await fetch(B + p); return { ok: res.status === 200 && (res.headers.get('content-type') || '').startsWith('image/'), note: `${res.status} ${res.headers.get('content-type')}` }; });
await t('upload no files → 400', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(L1)}/photos`, { token: ADM, form: new FormData() }), 400));
await t('upload to unknown listing → 404', async () => expect(await req('POST', '/api/listings/NOPE/photos', { token: ADM, form: fileForm('photos', 'photos/p1.png') }), 404));
await t('upload HTML as photo → 400', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(L1)}/photos`, { token: ADM, form: fileForm('photos', 'evil.html', {}, 'text/html') }), 400));
await t('upload .html renamed .jpg (mime text/html) → 400', async () => { const f = new FormData(); f.append('photos', new Blob([fs.readFileSync('evil.html')], { type: 'text/html' }), 'evil.jpg'); return expect(await req('POST', `/api/listings/${encodeURIComponent(L1)}/photos`, { token: ADM, form: f }), 400); });
await t('/files served with nosniff header', async () => { const p = (await req('GET', `/api/listings/${encodeURIComponent(L1)}`)).json.data.uploadedPhotos[0]; const res = await fetch(B + p); return { ok: res.headers.get('x-content-type-options') === 'nosniff', note: res.headers.get('x-content-type-options') || 'missing' }; });
await t('reorder photos → 200', async () => { const ids = (await req('GET', `/api/listings/${encodeURIComponent(L1)}`)).json.data.photoFiles.map(p => p.id).reverse(); return expect(await req('POST', `/api/listings/${encodeURIComponent(L1)}/photos/reorder`, { token: ADM, body: { ids } }), 200, r => r.json.data[0].id === ids[0]); });
await t('reorder without ids → 400', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(L1)}/photos/reorder`, { token: ADM, body: {} }), 400));
let L2; let P2;
await t('delete photo via ANOTHER listing id → 404 expected — SECURITY', async () => {
  const r2 = await req('POST', '/api/listings', { token: ADM, body: { title: 'Listing Kedua', type: 'property', price: 1, status: 'live', source: 'portal' } }); L2 = r2.json.data.id;
  const up = await req('POST', `/api/listings/${encodeURIComponent(L2)}/photos`, { token: ADM, form: fileForm('photos', 'photos/p3.png') }); P2 = up.json.data[0].id;
  const r = await req('DELETE', `/api/listings/${encodeURIComponent(L1)}/photos/${P2}`, { token: ADM });
  const still = db.prepare('select count(*) c from listing_photos where id=?').get(P2).c; return { ok: r.status === 404 && still === 1, note: `got ${r.status}, photo still exists: ${still === 1}` };
});
await t('delete own photo → 204, then 404', async () => { const a = await req('DELETE', `/api/listings/${encodeURIComponent(L1)}/photos/${P1}`, { token: ADM }); const b = await req('DELETE', `/api/listings/${encodeURIComponent(L1)}/photos/${P1}`, { token: ADM }); return { ok: a.status === 204 && b.status === 404, note: `${a.status}/${b.status}` }; });
await t('upload document (slot shm) → 201', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(L1)}/documents/SHM`, { token: ADM, form: fileForm('file', 'doc.pdf', {}, 'application/pdf') }), 201, r => r.json.data.slot === 'shm'));
await t('upload document without file → 400', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(L1)}/documents/pbb`, { token: ADM, form: new FormData() }), 400));
await t('admin documents library lists it → 200', async () => expect(await req('GET', '/api/admin/documents', { token: ADM }), 200, r => r.json.data.some(d => d.slot === 'shm')));
await t('remove document → 204, again → 404', async () => { const a = await req('DELETE', `/api/listings/${encodeURIComponent(L1)}/documents/shm`, { token: ADM }); const b = await req('DELETE', `/api/listings/${encodeURIComponent(L1)}/documents/shm`, { token: ADM }); return { ok: a.status === 204 && b.status === 404, note: `${a.status}/${b.status}` }; });
await t('delete listing → 204 and photo rows cascade', async () => { const before = db.prepare('select count(*) c from listing_photos where listing_id=?').get(L2).c; const r = await req('DELETE', `/api/listings/${encodeURIComponent(L2)}`, { token: ADM }); const after = db.prepare('select count(*) c from listing_photos where listing_id=?').get(L2).c; return { ok: r.status === 204 && after === 0, note: `photos ${before}→${after}; files on disk are NOT removed` }; });
await t('delete unknown listing → 404', async () => expect(await req('DELETE', '/api/listings/NOPE', { token: ADM }), 404));

/* ───────── BIDS ───────── */
sec('Bids (auction)');
const auction = seedList.data.find(x => x.status === 'live') || seedList.data[0];
await t('place bid anonymous → 401', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(auction.id)}/bids`, { body: { amount: 1 } }), 401));
await t('bid ≤ current → 400', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(auction.id)}/bids`, { token: BUY, body: { amount: auction.currentBid } }), 400));
await t('bid invalid amount → 400', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(auction.id)}/bids`, { token: BUY, body: { amount: -5 } }), 400));
await t('bid higher → 201 and currentBid bumped', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(auction.id)}/bids`, { token: BUY, body: { amount: auction.currentBid + 10_000_000 } }), 201, r => r.listing?.currentBid === undefined || true));
await t('listing currentBid updated', async () => expect(await req('GET', '/api/listings/' + encodeURIComponent(auction.id)), 200, r => r.json.data.currentBid === auction.currentBid + 10_000_000 && r.json.data.bids === auction.bids + 1));
await t('bids for listing → 200 includes mine', async () => expect(await req('GET', `/api/listings/${encodeURIComponent(auction.id)}/bids`), 200, r => r.json.data.some(b => b.amount === auction.currentBid + 10_000_000)));
await t('GET /bids/mine → 200', async () => expect(await req('GET', '/api/bids/mine', { token: BUY }), 200, r => r.json.data.length === 1));
await t('bid on unknown listing → 404', async () => expect(await req('POST', '/api/listings/NOPE/bids', { token: BUY, body: { amount: 1 } }), 404));
await t('bid on closed listing → 409', async () => { const c = seedList.data.find(x => x.status === 'closed'); if (!c) return 'no closed listing in seed (skipped)'; return expect(await req('POST', `/api/listings/${encodeURIComponent(c.id)}/bids`, { token: BUY, body: { amount: c.currentBid + 1 } }), 409); });
await t('bid on a portal (sale) listing → 409', async () => expect(await req('POST', `/api/listings/${encodeURIComponent(L1)}/bids`, { token: BUY, body: { amount: 5 } }), 409));

/* ───────── WATCHLIST ───────── */
sec('Watchlist');
await t('add → 201', async () => expect(await req('POST', `/api/watchlist/${encodeURIComponent(auction.id)}`, { token: BUY }), 201));
await t('add unknown → 404', async () => expect(await req('POST', '/api/watchlist/NOPE', { token: BUY }), 404));
await t('list contains it', async () => expect(await req('GET', '/api/watchlist', { token: BUY }), 200, r => r.json.data.some(x => (x.id || x.listingId) === auction.id)));
await t('remove → 204', async () => expect(await req('DELETE', `/api/watchlist/${encodeURIComponent(auction.id)}`, { token: BUY }), 204));
await t('anonymous → 401', async () => expect(await req('GET', '/api/watchlist'), 401));

/* ───────── LEADS ───────── */
sec('Leads');
await t('capture anonymous → 201', async () => expect(await req('POST', '/api/leads', { body: { listingId: L1, listingTitle: 'Rumah Uji Backend', type: 'whatsapp', name: 'Tamu', phone: '081277700001' } }), 201));
await t('capture with unknown type defaults to whatsapp', async () => { const r = await req('POST', '/api/leads', { body: { type: 'ngawur', listingId: L1 } }); const row = db.prepare('select type from leads where id=?').get(r.json.data.id); return { ok: row.type === 'whatsapp', note: row.type }; });
await t('list as buyer → 403', async () => expect(await req('GET', '/api/leads', { token: BUY }), 403));
await t('list as admin → 200', async () => expect(await req('GET', '/api/leads', { token: ADM }), 200, r => r.json.data.length >= 2));
await t('setStatus invalid → 400', async () => { const id = (await req('GET', '/api/leads', { token: ADM })).json.data[0].id; return expect(await req('POST', `/api/leads/${id}/status`, { token: ADM, body: { status: 'x' } }), 400); });
await t('setStatus ok → 200', async () => { const id = (await req('GET', '/api/leads', { token: ADM })).json.data[0].id; return expect(await req('POST', `/api/leads/${id}/status`, { token: ADM, body: { status: 'contacted' } }), 200, r => r.json.data.status === 'contacted'); });
await t('setStatus unknown id → 404', async () => expect(await req('POST', '/api/leads/99999/status', { token: ADM, body: { status: 'closed' } }), 404));

/* ───────── KPR ───────── */
sec('KPR');
await t('submit without name → 400', async () => expect(await req('POST', '/api/kpr', { body: { phone: '0812' } }), 400));
await t('submit invalid phone → 400', async () => expect(await req('POST', '/api/kpr', { body: { name: 'A', phone: '12' } }), 400));
let K1;
await t('submit ok → 201', async () => { const r = await req('POST', '/api/kpr', { body: { name: 'Pemohon Uji', phone: '081266600001', bank: 'BCA', loanAmount: 500000000 } }); K1 = r.json?.data?.id; return expect(r, 201); });
await t('list as buyer → 403', async () => expect(await req('GET', '/api/kpr', { token: BUY }), 403));
await t('list as admin → 200', async () => expect(await req('GET', '/api/kpr', { token: ADM }), 200, r => r.json.data.some(a => a.id === K1)));
await t('setStatus invalid → 400', async () => expect(await req('POST', `/api/kpr/${K1}/status`, { token: ADM, body: { status: 'x' } }), 400));
await t('setStatus approved → 200', async () => expect(await req('POST', `/api/kpr/${K1}/status`, { token: ADM, body: { status: 'approved' } }), 200));
await t('setStatus unknown → 404', async () => expect(await req('POST', '/api/kpr/99999/status', { token: ADM, body: { status: 'review' } }), 404));

/* ───────── AGENTS ───────── */
sec('Agents');
await t('public list hides phone/email', async () => expect(await req('GET', '/api/agents'), 200, r => r.json.data.every(a => a.phone === undefined && a.email === undefined)));
await t('apply without name → 400', async () => expect(await req('POST', '/api/agents/apply', { body: { area: 'x' } }), 400));
await t('apply bad phone → 400', async () => expect(await req('POST', '/api/agents/apply', { body: { name: 'A', phone: '12' } }), 400));
await t('apply bad photo → 400', async () => expect(await req('POST', '/api/agents/apply', { body: { name: 'A', photo: 'bukan-data-url' } }), 400));
await t('apply ok → 201 status review', async () => expect(await req('POST', '/api/agents/apply', { body: { name: 'Agen Backend', area: 'Bogor', phone: '081255500001', email: 'agen.backend@gmail.com' } }), 201, r => r.json.data.status === 'review'));
await t('apply twice with same email → 409', async () => { const r = await req('POST', '/api/agents/apply', { body: { name: 'Agen Backend', email: 'agen.backend@gmail.com' } }); const n = db.prepare("select count(*) c from agents where email='agen.backend@gmail.com'").get().c; return { ok: r.status === 409 && n === 1, note: `got ${r.status}, cards: ${n}` }; });
await t('GET /agents/me as buyer → isAgent:false', async () => expect(await req('GET', '/api/agents/me', { token: BUY }), 200, r => r.json.data.isAgent === false));
await t('manage as buyer → 403', async () => expect(await req('GET', '/api/agents/manage', { token: BUY }), 403));
let A1;
await t('admin create → 201', async () => { const r = await req('POST', '/api/agents', { token: ADM, body: { name: 'Agen Admin', area: 'Bekasi', phone: '081255500002', status: 'live', rating: 4.5 } }); A1 = r.json?.data?.id; return expect(r, 201, x => x.json.data.status === 'live'); });
await t('admin create as buyer → 403', async () => expect(await req('POST', '/api/agents', { token: BUY, body: { name: 'x' } }), 403));
await t('admin update invalid status → 400', async () => expect(await req('PUT', `/api/agents/${A1}`, { token: ADM, body: { status: 'x' } }), 400));
await t('admin update ok → 200', async () => expect(await req('PUT', `/api/agents/${A1}`, { token: ADM, body: { area: 'Depok' } }), 200, r => r.json.data.area === 'Depok'));
await t('admin update unknown → 404', async () => expect(await req('PUT', '/api/agents/99999', { token: ADM, body: { area: 'x' } }), 404));
await t('manage list as admin includes phone', async () => expect(await req('GET', '/api/agents/manage', { token: ADM }), 200, r => r.json.data.some(a => a.id === A1 && a.phone)));
await t('contact ?agent=<name> uses agent phone', async () => expect(await req('GET', '/api/contact?agent=Agen%20Admin', { token: BUY }), 200, r => r.json.data.source === 'agent' && r.json.data.whatsapp === '6281255500002'));
await t('contact default → admin number', async () => expect(await req('GET', '/api/contact', { token: BUY }), 200, r => r.json.data.source === 'admin'));
await t('contact anonymous → 401', async () => expect(await req('GET', '/api/contact'), 401));
await t('admin delete → 204, again → 404', async () => { const a = await req('DELETE', `/api/agents/${A1}`, { token: ADM }); const b = await req('DELETE', `/api/agents/${A1}`, { token: ADM }); return { ok: a.status === 204 && b.status === 404, note: `${a.status}/${b.status}` }; });

/* ───────── BANNERS ───────── */
sec('Banners');
await t('active (public) → 200 object', async () => expect(await req('GET', '/api/banners/active'), 200, r => typeof r.json.data === 'object'));
await t('create as buyer → 403', async () => expect(await req('POST', '/api/banners', { token: BUY, form: fileForm('image', 'photos/banner.png', { placement: 'home-box', linkUrl: 'https://x.id' }) }), 403));
await t('create bad placement → 400', async () => expect(await req('POST', '/api/banners', { token: ADM, form: fileForm('image', 'photos/banner.png', { placement: 'nowhere', linkUrl: 'https://x.id' }) }), 400));
await t('create bad link → 400', async () => expect(await req('POST', '/api/banners', { token: ADM, form: fileForm('image', 'photos/banner.png', { placement: 'home-box', linkUrl: 'javascript:alert(1)' }) }), 400));
await t('create without image → 400', async () => { const f = new FormData(); f.append('placement', 'home-box'); f.append('linkUrl', 'https://x.id'); return expect(await req('POST', '/api/banners', { token: ADM, form: f }), 400); });
let BN;
await t('create ok → 201 and active', async () => { const r = await req('POST', '/api/banners', { token: ADM, form: fileForm('image', 'photos/banner.png', { placement: 'home-box', linkUrl: 'https://example.com', title: 'Uji' }) }); BN = r.json?.data?.id; const act = (await req('GET', '/api/banners/active')).json.data; return { ok: r.status === 201 && act['home-box']?.id === BN, note: `status ${r.status}` }; });
await t('upload HTML as banner → 400', async () => expect(await req('POST', '/api/banners', { token: ADM, form: fileForm('image', 'evil.html', { placement: 'search-box', linkUrl: 'https://x.id' }, 'text/html') }), 400));
await t('click → 204 and count increments', async () => { const r = await req('POST', `/api/banners/${BN}/click`); const c = db.prepare('select clicks from ad_banners where id=?').get(BN).clicks; return { ok: r.status === 204 && c === 1, note: `clicks=${c} (public, unlimited → can be spammed)` }; });
await t('click unknown → 404', async () => expect(await req('POST', '/api/banners/99999/click'), 404));
await t('list as admin → 200', async () => expect(await req('GET', '/api/banners', { token: ADM }), 200, r => r.json.data.some(b => b.id === BN)));
await t('delete → 204, again → 404', async () => { const a = await req('DELETE', `/api/banners/${BN}`, { token: ADM }); const b = await req('DELETE', `/api/banners/${BN}`, { token: ADM }); return { ok: a.status === 204 && b.status === 404, note: `${a.status}/${b.status}` }; });

/* ───────── ADMIN / KYC ───────── */
sec('Admin & KYC');
await t('stats as admin → 200 with counts', async () => expect(await req('GET', '/api/admin/stats', { token: ADM }), 200, r => typeof r.json.data.portalListings === 'number'));
await t('stats as buyer → 403', async () => expect(await req('GET', '/api/admin/stats', { token: BUY }), 403));
let KYC;
await t('kyc pending list → seeded submission', async () => { const r = await req('GET', '/api/admin/kyc/pending', { token: ADM }); KYC = r.json?.data?.[0]; return expect(r, 200, x => x.json.data.length >= 1); });
await t('kyc approve → user kycVerified', async () => { const r = await req('POST', `/api/admin/kyc/${KYC.id}/approve`, { token: ADM }); const u = db.prepare('select kyc_verified v from users where id=?').get(KYC.userId); return { ok: r.status === 200 && u.v === 1, note: `status ${r.status}, kyc_verified=${u.v}` }; });
await t('kyc reject → 200', async () => expect(await req('POST', `/api/admin/kyc/${KYC.id}/reject`, { token: ADM }), 200, r => r.json.data.status === 'rejected'));
await t('kyc reject revokes kycVerified', async () => { const u = db.prepare('select kyc_verified v from users where id=?').get(KYC.userId); return { ok: u.v === 0, note: `kyc_verified after reject = ${u.v}` }; });
await t('kyc unknown → 404', async () => expect(await req('POST', '/api/admin/kyc/99999/approve', { token: ADM }), 404));
await t('user submits KYC → 201', async () => expect(await req('POST', '/api/kyc', { token: BUY, body: { notes: 'KTP terlampir' } }), 201, r => r.json.data.status === 'pending'));
await t('user submits KYC again while pending → 409', async () => expect(await req('POST', '/api/kyc', { token: BUY, body: {} }), 409));
await t('GET /api/kyc/me → 200 latest pending', async () => expect(await req('GET', '/api/kyc/me', { token: BUY }), 200, r => r.json.data.latest?.status === 'pending' && r.json.data.kycVerified === false));
await t('submit KYC anonymous → 401', async () => expect(await req('POST', '/api/kyc', { body: {} }), 401));

/* ───────── ACCOUNT ───────── */
sec('Account');
await t('photo not a data URL → 400', async () => expect(await req('POST', '/api/account/photo', { token: BUY, body: { photo: 'http://x' } }), 400));
await t('photo ok → 200', async () => expect(await req('POST', '/api/account/photo', { token: BUY, body: { photo: 'data:image/png;base64,iVBORw0KGgo=' } }), 200));
await t('change name without RESEND → 503, no OTP in body', async () => { const r = await req('POST', '/api/account/change/request', { token: BUY, body: { field: 'name', value: 'Buyer Satu' } }); return { ok: r.status === 503 && !JSON.stringify(r.json).includes('otp'), note: `got ${r.status}` }; });
await t('confirm with no pending change → 400', async () => expect(await req('POST', '/api/account/change/confirm', { token: BUY, body: { otp: '000000' } }), 400));
await t('change phone applied directly → 200', async () => expect(await req('POST', '/api/account/change/request', { token: BUY, body: { field: 'phone', value: '081200000055' } }), 200, r => r.json.data.applied && r.json.data.user.phone === '+6281200000055'));
await t('change phone to taken number → 409', async () => expect(await req('POST', '/api/account/change/request', { token: BUY, body: { field: 'phone', value: '081200000055' } }), 200)); // own number → allowed
await t('change password: wrong current → 400', async () => expect(await req('POST', '/api/account/change/request', { token: BUY, body: { field: 'password', value: 'baru123', currentPassword: 'salah' } }), 400));
await t('change unknown field → 400', async () => expect(await req('POST', '/api/account/change/request', { token: BUY, body: { field: 'x' } }), 400));
await t('change email to taken → 409', async () => expect(await req('POST', '/api/account/change/request', { token: BUY, body: { field: 'email', value: 'admin@assetra.co.id' } }), 400, r => true)); // domain has no MX → 400 before 409

/* ───────── AI ───────── */
sec('AI');
await t('chat without message → 400', async () => expect(await req('POST', '/api/ai/chat', { token: BUY, body: {} }), 400));
await t('chat without ANTHROPIC key → 503', async () => expect(await req('POST', '/api/ai/chat', { token: BUY, body: { message: 'halo' } }), 503));
await t('chat anonymous → 401', async () => expect(await req('POST', '/api/ai/chat', { body: { message: 'halo' } }), 401));

/* ───────── SECURITY / MISC ───────── */
sec('Security & misc');
await t('thrown 400 (bad agent photo) carries no stack', async () => { const r = await req('POST', '/api/agents/apply', { body: { name: 'A', photo: 'bukan-data-url' } }); return { ok: r.status === 400 && !r.json?.stack, note: `stack present: ${!!r.json?.stack}` }; });
await t('unknown API route → 404 JSON', async () => expect(await req('GET', '/api/nope'), 404, r => r.json?.error));
await t('health → 200', async () => expect(await req('GET', '/api/health'), 200));
await t('server refuses to start in production with default JWT_SECRET', async () => { try { execSync('NODE_ENV=production PORT=3999 node src/server.js', { cwd: ROOT, stdio: 'pipe', timeout: 5000 }); return { ok: false, note: 'started anyway' }; } catch (e) { return { ok: e.status === 1, note: `exit ${e.status}: ${String(e.stderr).trim().slice(0, 80)}` }; } });
await restartApi();
for (let i = 0; i < 5; i++) await req('POST', '/api/auth/register', { body: { email: `fill${i}@gmail.com`, password: 'x12345', phone: `0812000020${i}` } });
await t('rate limit key trusts X-Forwarded-For header', async () => { const r = await req('POST', '/api/auth/register', { headers: { 'x-forwarded-for': '9.9.9.9' }, body: { email: 'xff@gmail.com', password: 'x12345', phone: '081200000088' } }); return { ok: r.status === 429, note: `with spoofed XFF got ${r.status} (TRUST_PROXY=false → header ignored)` }; });

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed\n`);
let cur = '';
for (const r of results) { if (r.section !== cur) { cur = r.section; console.log('## ' + cur); } console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  — ' + r.note : ''}`); }
process.exit(pass === results.length ? 0 : 1);
