/* Centralized env loader. Imported once at startup. */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: Number(process.env.PORT || 3001),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  DB_PATH: process.env.DB_PATH || './data/assetra.db',
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  /* Email transaksional (Resend). Tanpa key → forgot-password jalan dalam mode demo. */
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  /* Pengirim: setelah domain terverifikasi ganti mis. 'Assetra <no-reply@domainmu.com>'.
     Default onboarding@resend.dev hanya bisa mengirim ke email pemilik akun Resend. */
  RESEND_FROM: process.env.RESEND_FROM || 'Assetra <onboarding@resend.dev>',
  APP_URL: process.env.APP_URL || 'http://localhost:5173',
  /* Google SSO: samakan dengan VITE_GOOGLE_CLIENT_ID di frontend.
     Terisi → kredensial Google diverifikasi server-side (produksi).
     Kosong → mode demo (profil dipercaya tanpa verifikasi). */
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  /* Nomor WhatsApp kontak admin Assetra (format internasional 62...).
     Hanya disajikan lewat endpoint yang wajib login → tidak bocor ke tamu. */
  CONTACT_WA: process.env.CONTACT_WA || '6288906270430',
};
