/* Jadikan sebuah akun sebagai admin (buat baru bila belum ada).
   Pemakaian:  node scripts/make-admin.mjs <email> [sandi]
   - Akun sudah ada  → role diubah ke admin, email & KYC ditandai terverifikasi; sandi diganti bila diberikan.
   - Akun belum ada  → dibuat sebagai admin; sandi wajib (min 8 karakter). */
import bcrypt from 'bcryptjs';
import { db } from '../src/config/db.js';
import { initSchema } from '../src/db/init.js';

initSchema();
const email = (process.argv[2] || '').trim().toLowerCase();
const password = process.argv[3] || '';
if (!email || !email.includes('@')) { console.error('Pemakaian: node scripts/make-admin.mjs <email> [sandi]'); process.exit(1); }
if (password && password.length < 8) { console.error('Sandi minimal 8 karakter'); process.exit(1); }

const existing = db.prepare('SELECT id, role FROM users WHERE email = ? COLLATE NOCASE').get(email);
if (existing) {
  db.prepare("UPDATE users SET role = 'admin', email_verified = 1, kyc_verified = 1 WHERE id = ?").run(existing.id);
  if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), existing.id);
  console.log(`[make-admin] ${email} sekarang admin${password ? ' (sandi diperbarui)' : ''}`);
} else {
  if (!password) { console.error(`Akun ${email} belum ada — berikan sandi untuk membuatnya`); process.exit(1); }
  db.prepare(`INSERT INTO users (email, password_hash, name, role, kyc_verified, email_verified, provider)
              VALUES (?, ?, ?, 'admin', 1, 1, 'admin')`).run(email, bcrypt.hashSync(password, 10), email.split('@')[0]);
  console.log(`[make-admin] akun admin ${email} dibuat`);
}
