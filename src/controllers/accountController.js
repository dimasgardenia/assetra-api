/* Pengaturan akun: ganti nama / email / telepon / sandi + upload foto.
   Semua perubahan (kecuali foto) butuh OTP:
     - nama, email, sandi  → OTP via EMAIL
     - telepon             → OTP via WHATSAPP (mode demo bila provider belum ada)
   Ganti email: OTP ke email LAMA; email baru wajib verifikasi ulang (link).
   Ganti sandi: wajib sandi lama + OTP email. */
import crypto from 'crypto';
import { Resend } from 'resend';
import { env } from '../config/env.js';
import { UserModel } from '../models/User.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { isEmailFormatValid, domainAcceptsEmail } from '../utils/emailCheck.js';
import { normalizeIndoPhone } from '../utils/phone.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const gen6 = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/* Kirim OTP via email (Resend). Tanpa key → mode demo (kode dikembalikan ke UI). */
async function sendOtpEmail(email, otp, purpose) {
  if (!resend) return false;
  const html = `<!doctype html><html><body style="margin:0;background:#EEF1F7;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
        <tr><td style="background:#0A1640;border-radius:14px 14px 0 0;padding:20px 32px;color:#fff;font-family:Georgia,serif;font-size:20px;font-weight:bold;letter-spacing:2px">ASSETRA<span style="color:#3BC4D9">.</span></td></tr>
        <tr><td style="background:#fff;padding:32px;border:1px solid #E3E8F2;border-top:none;border-radius:0 0 14px 14px">
          <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-weight:normal;font-size:22px;color:#0A1640">Kode verifikasi</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3D4A63">Gunakan kode berikut untuk ${purpose}. Jangan bagikan kode ini kepada siapa pun.</p>
          <div style="font-family:'Courier New',monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:#0A1640;background:#F4F7FC;border:1px solid #E3E8F2;border-radius:10px;padding:16px;text-align:center;margin-bottom:18px">${otp}</div>
          <p style="margin:0;font-size:12.5px;color:#8A93AB;line-height:1.6">Kode berlaku 10 menit. Jika Anda tidak meminta perubahan ini, abaikan email ini.</p>
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM, to: email, subject: `Kode verifikasi Assetra: ${otp}`,
    html, text: `Kode verifikasi Assetra Anda untuk ${purpose}: ${otp} (berlaku 10 menit).`,
  });
  if (error) { console.error('[account] gagal kirim OTP email:', error); return false; }
  return true;
}

/* Kirim OTP via WhatsApp — MODE DEMO sampai provider aktif (kode ke UI). */
async function sendOtpWhatsApp(phone, otp) {
  console.log(`[account] (demo) WhatsApp OTP untuk ${phone}: ${otp}`);
  return false; // false = mode demo
}

/* Kirim link verifikasi email baru (setelah ganti email). */
async function sendVerifyLink(email, token) {
  if (!resend) return false;
  const link = `${env.APP_URL}/auth?verify=${token}&email=${encodeURIComponent(email)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#EEF1F7;font-family:Arial,sans-serif;padding:32px 16px">
    <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #E3E8F2;border-radius:14px;padding:32px">
      <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;color:#0A1640;margin:0 0 10px">Verifikasi email baru Anda</h1>
      <p style="font-size:14px;color:#3D4A63;line-height:1.6;margin:0 0 20px">Anda mengganti email akun Assetra. Klik untuk mengaktifkan email baru ini.</p>
      <a href="${link}" style="display:inline-block;background:#1A6FA8;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:bold;font-size:14px">Verifikasi email &rarr;</a>
      <p style="font-size:12px;color:#8A93AB;margin:20px 0 0;word-break:break-all">Atau salin: <a href="${link}" style="color:#1A6FA8">${link}</a></p>
    </div></body></html>`;
  const { error } = await resend.emails.send({ from: env.RESEND_FROM, to: email, subject: 'Verifikasi email baru — Assetra', html, text: `Verifikasi email baru Anda: ${link}` });
  return !error;
}

export const accountController = {
  /** Upload/ganti foto profil — TANPA OTP. Foto berupa data URL kecil. */
  async updatePhoto(req, res) {
    const { photo } = req.body || {};
    if (photo && !/^data:image\/(png|jpe?g|webp);base64,/i.test(String(photo))) {
      return res.status(400).json({ error: 'Foto harus berupa data URL gambar' });
    }
    if (photo && String(photo).length > 400_000) return res.status(400).json({ error: 'Foto terlalu besar' });
    const user = UserModel.updateProfile(req.user.id, { picture: photo || null });
    res.json({ data: UserModel.toPublic(user) });
  },

  /** Minta perubahan (nama/email/telepon/sandi) → kirim OTP, simpan tertunda. */
  async requestChange(req, res) {
    const { field, value, currentPassword } = req.body || {};
    const user = UserModel.findById(req.user.id);
    const otp = gen6();
    const expires = Date.now() + OTP_TTL_MS;

    if (field === 'name') {
      if (!value || !String(value).trim()) return res.status(400).json({ error: 'Nama tidak boleh kosong' });
      UserModel.setPendingChange(user.id, { field, payload: { value: String(value).trim() }, otp, channel: 'email', expires });
      const sent = await sendOtpEmail(user.email, otp, 'mengubah nama profil');
      return res.json({ data: { channel: 'email', to: user.email, ...(sent ? {} : { demo: { otp } }) } });
    }

    if (field === 'email') {
      const email = String(value || '').trim().toLowerCase();
      if (!isEmailFormatValid(email)) return res.status(400).json({ error: 'Format email tidak valid' });
      if (!(await domainAcceptsEmail(email))) return res.status(400).json({ error: 'Domain email tidak dikenal' });
      if (UserModel.findByEmail(email)) return res.status(409).json({ error: 'Email sudah dipakai akun lain' });
      /* OTP dikirim ke email LAMA untuk konfirmasi identitas. */
      UserModel.setPendingChange(user.id, { field, payload: { value: email }, otp, channel: 'email', expires });
      const sent = await sendOtpEmail(user.email, otp, 'mengganti alamat email');
      return res.json({ data: { channel: 'email', to: user.email, ...(sent ? {} : { demo: { otp } }) } });
    }

    if (field === 'phone') {
      const phone = normalizeIndoPhone(value || '');
      if (!phone) return res.status(400).json({ error: 'Nomor tidak valid — gunakan 08xx / +62xx' });
      const owner = UserModel.findByPhone(phone);
      if (owner && owner.id !== user.id) return res.status(409).json({ error: 'Nomor sudah dipakai akun lain' });
      /* OTP dikirim via WhatsApp ke nomor BARU. */
      UserModel.setPendingChange(user.id, { field, payload: { value: phone }, otp, channel: 'whatsapp', expires });
      const sent = await sendOtpWhatsApp(phone, otp);
      return res.json({ data: { channel: 'whatsapp', to: phone, ...(sent ? {} : { demo: { otp } }) } });
    }

    if (field === 'password') {
      if (!currentPassword) return res.status(400).json({ error: 'Sandi lama wajib diisi' });
      const ok = user.passwordHash && await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) return res.status(400).json({ error: 'Sandi lama salah' });
      if (!value || String(value).length < 6) return res.status(400).json({ error: 'Sandi baru minimal 6 karakter' });
      const passwordHash = await hashPassword(String(value));
      UserModel.setPendingChange(user.id, { field, payload: { passwordHash }, otp, channel: 'email', expires });
      const sent = await sendOtpEmail(user.email, otp, 'mengganti kata sandi');
      return res.json({ data: { channel: 'email', to: user.email, ...(sent ? {} : { demo: { otp } }) } });
    }

    return res.status(400).json({ error: 'Field tidak dikenal' });
  },

  /** Konfirmasi OTP → terapkan perubahan tertunda. */
  async confirmChange(req, res) {
    const { otp } = req.body || {};
    const pending = UserModel.getPendingChange(req.user.id);
    if (!pending) return res.status(400).json({ error: 'Tidak ada perubahan tertunda' });
    if (pending.expires < Date.now()) { UserModel.clearPendingChange(req.user.id); return res.status(400).json({ error: 'Kode kedaluwarsa — minta ulang' }); }
    if (String(otp || '').trim() !== pending.otp) return res.status(400).json({ error: 'Kode salah' });

    let user, extra = {};
    if (pending.field === 'name') {
      user = UserModel.updateProfile(req.user.id, { name: pending.payload.value });
    } else if (pending.field === 'password') {
      user = UserModel.updatePassword(req.user.id, pending.payload.passwordHash);
    } else if (pending.field === 'phone') {
      UserModel.setPhone(req.user.id, pending.payload.value);
      user = UserModel.markPhoneVerified(req.user.id); // OTP WA = verifikasi nomor
    } else if (pending.field === 'email') {
      user = UserModel.updateEmail(req.user.id, pending.payload.value); // email_verified → 0
      const vtoken = crypto.randomBytes(32).toString('hex');
      UserModel.setVerifyToken(user.id, vtoken, Date.now() + VERIFY_TTL_MS);
      const sent = await sendVerifyLink(user.email, vtoken);
      extra = { emailChanged: true, needsReverify: true, ...(sent ? {} : { demo: { verifyToken: vtoken } }) };
    }
    UserModel.clearPendingChange(req.user.id);
    res.json({ data: UserModel.toPublic(user), ...extra });
  },
};
