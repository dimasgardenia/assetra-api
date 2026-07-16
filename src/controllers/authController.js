/* Auth: register, login (email/password), Google SSO, forgot/reset password, me. */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { UserModel } from '../models/User.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { isEmailFormatValid, domainAcceptsEmail } from '../utils/emailCheck.js';
import { normalizeIndoPhone } from '../utils/phone.js';

const RESET_TTL_MS = 15 * 60 * 1000;        // token reset berlaku 15 menit
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;  // token verifikasi berlaku 24 jam
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

/* Logo Assetra disematkan inline (CID) — dimuat sekali saat startup. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let LOGO_B64 = null;
try {
  LOGO_B64 = fs.readFileSync(path.join(__dirname, '../assets/email-logo.png')).toString('base64');
} catch { /* tanpa logo → header pakai teks */ }

/* Template email bermerek Assetra yang dipakai bersama (reset password &
   verifikasi email). Anti-spam: layout table, CSS inline, logo inline CID,
   ukuran kecil, plus versi teks polos sebagai pendamping. */
async function sendBrandedEmail(email, { subject, title, introHtml, buttonLabel, link, ttlLabel, footnote, textLines }) {
  const html = `
<!doctype html>
<html lang="id">
<body style="margin:0;padding:0;background-color:#EEF1F7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF1F7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- header brand: logo Assetra saja -->
        <tr>
          <td style="background-color:#0A1640;border-radius:14px 14px 0 0;padding:20px 36px;">
            ${LOGO_B64
              ? `<img src="cid:assetra-logo" alt="ASSETRA" height="30" style="display:block;height:30px;width:auto;border:0;outline:none;">`
              : `<span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:#FFFFFF;letter-spacing:2px;">ASSETRA<span style="color:#3BC4D9;">.</span></span>`}
          </td>
        </tr>

        <!-- kartu isi -->
        <tr>
          <td style="background-color:#FFFFFF;padding:36px;border-radius:0 0 14px 14px;border:1px solid #E3E8F2;border-top:none;">
            <h1 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;color:#0A1640;">
              ${title}
            </h1>
            <p style="margin:0 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#3D4A63;">
              ${introHtml}
            </p>

            <!-- tombol -->
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
              <tr>
                <td style="background-color:#1A6FA8;border-radius:10px;">
                  <a href="${link}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">
                    ${buttonLabel} &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <!-- info masa berlaku -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
              <tr>
                <td style="background-color:#F4F7FC;border:1px solid #E3E8F2;border-radius:10px;padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#5A6B80;line-height:1.6;">
                  &#9200;&nbsp; ${ttlLabel}
                </td>
              </tr>
            </table>

            <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A93AB;line-height:1.6;">
              Tombol tidak berfungsi? Salin tautan ini ke browser Anda:
            </p>
            <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;word-break:break-all;">
              <a href="${link}" style="color:#1A6FA8;">${link}</a>
            </p>

            <hr style="border:none;border-top:1px solid #E9EDF5;margin:0 0 18px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A93AB;line-height:1.7;">
              ${footnote}
            </p>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="padding:20px 36px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9AA3B8;line-height:1.7;" align="center">
            Email otomatis dari Assetra — mohon tidak membalas email ini.<br>
            PT Assetra Properti Nusantara &middot; Jakarta, Indonesia
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from: env.RESEND_FROM,
    to: email,
    subject,
    html,
    /* Logo disematkan inline via CID agar tampil tanpa memuat gambar eksternal. */
    ...(LOGO_B64 ? { attachments: [{ filename: 'assetra-logo.png', content: LOGO_B64, contentId: 'assetra-logo' }] } : {}),
    /* Versi teks polos — melengkapi HTML dan menaikkan skor anti-spam. */
    text: textLines.join('\n'),
  });
  if (error) throw new Error(error.message || 'Resend send failed');
}

function sendResetEmail(email, token) {
  const link = `${env.APP_URL}/auth?reset=${token}&email=${encodeURIComponent(email)}`;
  return sendBrandedEmail(email, {
    subject: 'Atur ulang kata sandi Assetra Anda',
    title: 'Atur ulang kata sandi',
    introHtml: `Halo, kami menerima permintaan untuk mengatur ulang kata sandi akun Assetra Anda (<b style="color:#0A1640;">${email}</b>). Klik tombol di bawah untuk membuat kata sandi baru.`,
    buttonLabel: 'Buat kata sandi baru',
    link,
    ttlLabel: 'Tautan ini berlaku <b style="color:#0A1640;">15 menit</b> dan hanya dapat digunakan satu kali.',
    footnote: 'Bukan Anda yang meminta? Abaikan email ini — kata sandi Anda tetap aman dan tidak berubah.',
    textLines: [
      'Atur ulang kata sandi Assetra',
      '',
      `Kami menerima permintaan reset kata sandi untuk akun ${email}.`,
      'Buka tautan berikut untuk membuat kata sandi baru (berlaku 15 menit, sekali pakai):',
      link,
      '',
      'Bukan Anda yang meminta? Abaikan email ini — kata sandi Anda tidak berubah.',
    ],
  });
}

function sendWelcomeEmail(email, name) {
  const first = (name || email).split(/[\s@]/)[0];
  return sendBrandedEmail(email, {
    subject: 'Selamat datang di Assetra 🏠',
    title: `Halo ${first}, selamat bergabung!`,
    introHtml: `Akun Assetra Anda sudah aktif. Mulai jelajahi ribuan listing terverifikasi, bandingkan KPR dari 12 bank mitra, dan manfaatkan Konsultan AI untuk menilai potensi investasi setiap properti.`,
    buttonLabel: 'Mulai jelajah properti',
    link: env.APP_URL,
    ttlLabel: 'Gratis untuk pembeli & penyewa. Pemilik properti mendapat <b style="color:#0A1640;">2 listing gratis</b>.',
    footnote: 'Butuh bantuan? Balas tidak tersedia di alamat ini — hubungi kami lewat halaman Bantuan di situs.',
    textLines: [
      `Halo ${first}, selamat bergabung di Assetra!`,
      '',
      'Akun Anda sudah aktif. Mulai jelajahi listing terverifikasi, bandingkan KPR, dan coba Konsultan AI:',
      env.APP_URL,
    ],
  });
}

function sendVerifyEmail(email, token) {
  const link = `${env.APP_URL}/auth?verify=${token}&email=${encodeURIComponent(email)}`;
  return sendBrandedEmail(email, {
    subject: 'Verifikasi email akun Assetra Anda',
    title: 'Selamat datang di Assetra 👋',
    introHtml: `Terima kasih telah mendaftar! Satu langkah lagi — klik tombol di bawah untuk memverifikasi alamat email Anda (<b style="color:#0A1640;">${email}</b>) dan mulai menjelajah properti.`,
    buttonLabel: 'Verifikasi email saya',
    link,
    ttlLabel: 'Tautan verifikasi berlaku <b style="color:#0A1640;">24 jam</b>.',
    footnote: 'Tidak merasa mendaftar di Assetra? Abaikan email ini dan akun tidak akan diaktifkan.',
    textLines: [
      'Selamat datang di Assetra!',
      '',
      `Verifikasi alamat email ${email} dengan membuka tautan berikut (berlaku 24 jam):`,
      link,
      '',
      'Tidak merasa mendaftar? Abaikan email ini.',
    ],
  });
}

const PHONE_OTP_TTL_MS = 5 * 60 * 1000; // OTP WhatsApp berlaku 5 menit

/* ╔══════════════════════════════════════════════════════════════════╗
   ║ TITIK INTEGRASI PENYEDIA WHATSAPP                                 ║
   ║ Saat penyedia (SendTalk/Verihubs/Twilio/Meta Cloud API) siap,     ║
   ║ implementasikan pengiriman di fungsi ini lalu return true.        ║
   ║ Selama return false → sistem berjalan dalam MODE DEMO:            ║
   ║ OTP dikembalikan ke UI agar alur tetap bisa diuji end-to-end.     ║
   ╚══════════════════════════════════════════════════════════════════╝ */
async function sendWhatsAppOtp(phone, otp) {
  // TODO(provider): contoh Meta Cloud API —
  //   await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace('+', ''),
  //       type: 'template', template: { name: 'otp_assetra', language: { code: 'id' },
  //       components: [{ type: 'body', parameters: [{ type: 'text', text: otp }] }] } }),
  //   });
  console.log(`[auth] (demo) WhatsApp OTP untuk ${phone}: ${otp}`);
  return false; // false = belum ada penyedia → mode demo
}

function makeAuthResponse(user) {
  const publicUser = UserModel.toPublic(user);
  const token = signToken({ sub: user.id, role: user.role });
  return { user: publicUser, token };
}

export const authController = {
  async register(req, res) {
    const { email, password, name, accountType, phone } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    /* Validasi email sebelum apa pun: format + domain harus punya MX record.
       Email fiktif tidak pernah membuat akun ataupun memicu Resend. */
    if (!isEmailFormatValid(email)) {
      return res.status(400).json({ error: 'Format email tidak valid' });
    }
    if (!(await domainAcceptsEmail(email))) {
      return res.status(400).json({ error: 'Domain email tidak dikenal — periksa kembali penulisan email Anda' });
    }

    /* Nomor WhatsApp aktif wajib untuk pendaftaran manual. */
    const normPhone = normalizeIndoPhone(phone || '');
    if (!normPhone) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid — gunakan format 08xx / +62xx' });
    }
    const phoneOwner = UserModel.findByPhone(normPhone);
    if (phoneOwner) return res.status(409).json({ error: 'Nomor WhatsApp sudah terdaftar' });

    const existing = UserModel.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await hashPassword(password);
    const role = /admin/i.test(email) ? 'admin' : 'bidder';
    const user = UserModel.create({
      email,
      passwordHash: hash,
      name: name || email.split('@')[0],
      role,
      accountType,
      provider: 'email',
      kycVerified: false,
      phone: normPhone,
    });

    /* Gerbang verifikasi: akun baru TIDAK langsung mendapat sesi.
       Kirim tautan verifikasi; user masuk setelah klik tautan di email. */
    const token = crypto.randomBytes(32).toString('hex');
    UserModel.setVerifyToken(user.id, token, Date.now() + VERIFY_TTL_MS);
    if (resend) {
      try {
        await sendVerifyEmail(email, token);
        console.log(`[auth] verification email sent to ${email}`);
      } catch (e) {
        console.error(`[auth] verification email FAILED for ${email}:`, e.message);
      }
      return res.status(201).json({ pendingVerification: true, email });
    }
    /* Mode demo (tanpa RESEND_API_KEY): token dikembalikan agar UI bisa lanjut. */
    console.log(`[auth] verification requested for ${email} — token: ${token}`);
    return res.status(201).json({ pendingVerification: true, email, demo: { verifyToken: token } });
  },

  async login(req, res) {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = UserModel.findByEmail(email);
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    /* Akun email yang belum diverifikasi tidak boleh masuk. */
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Email belum diverifikasi — cek kotak masuk Anda', code: 'EMAIL_UNVERIFIED', email });
    }

    return res.json(makeAuthResponse(user));
  },

  /** Klik tautan verifikasi dari email → aktifkan akun + sesi (auto-login). */
  async verifyEmail(req, res) {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    const user = UserModel.findByVerifyToken(token);
    if (!user || !user.verifyExpires || user.verifyExpires < Date.now()) {
      return res.status(400).json({ error: 'Tautan verifikasi tidak valid atau sudah kedaluwarsa' });
    }
    const updated = UserModel.markEmailVerified(user.id);
    console.log(`[auth] email verified: ${updated.email}`);
    /* Email selamat datang — fire & forget, tidak memblokir login. */
    if (resend) {
      sendWelcomeEmail(updated.email, updated.name)
        .then(() => console.log(`[auth] welcome email sent to ${updated.email}`))
        .catch(e => console.error(`[auth] welcome email FAILED for ${updated.email}:`, e.message));
    }
    return res.json(makeAuthResponse(updated));
  },

  /** Kirim ulang tautan verifikasi. Jawaban generik (anti-enumerasi). */
  async sendVerification(req, res) {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });

    const generic = { ok: true, message: 'If the email is registered and unverified, a link has been sent.' };
    if (!isEmailFormatValid(email) || !(await domainAcceptsEmail(email))) return res.json(generic);

    const user = UserModel.findByEmail(email);
    if (!user) return res.json(generic);
    /* Sudah terverifikasi → beri tahu eksplisit agar UI berhenti menawarkan
       kirim ulang (mis. tautan diklik di tab lain). Aman: dilindungi rate limit. */
    if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });

    const token = crypto.randomBytes(32).toString('hex');
    UserModel.setVerifyToken(user.id, token, Date.now() + VERIFY_TTL_MS);
    if (resend) {
      try {
        await sendVerifyEmail(email, token);
        console.log(`[auth] verification email re-sent to ${email}`);
      } catch (e) {
        console.error(`[auth] verification email FAILED for ${email}:`, e.message);
      }
      return res.json(generic);
    }
    return res.json({ ...generic, demo: { verifyToken: token } });
  },

  /** Step 1 — request a reset token. Responds generically whether or not the
   *  email exists (prevents account enumeration). Production would email the
   *  link; this demo has no SMTP, so a registered email also gets the token
   *  back in the response (clearly marked) so the UI can continue the flow. */
  async forgotPassword(req, res) {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });

    /* Email tak valid / domain tanpa MX → jawaban generik yang sama,
       tanpa menyentuh database ataupun Resend (anti-abuse). */
    const generic = { ok: true, message: 'If the email is registered, a reset link has been sent.' };
    if (!isEmailFormatValid(email) || !(await domainAcceptsEmail(email))) return res.json(generic);

    const user = UserModel.findByEmail(email);
    if (!user || !user.passwordHash) return res.json(generic); // akun SSO / tak terdaftar → jawaban sama

    const token = crypto.randomBytes(32).toString('hex');
    UserModel.setResetToken(user.id, token, Date.now() + RESET_TTL_MS);

    /* Resend terpasang → kirim email sungguhan; jawaban tetap generik.
       Kegagalan kirim dicatat tapi tidak dibocorkan ke klien. */
    if (resend) {
      try {
        await sendResetEmail(email, token);
        console.log(`[auth] reset email sent to ${email}`);
      } catch (e) {
        console.error(`[auth] reset email FAILED for ${email}:`, e.message);
      }
      return res.json(generic);
    }

    /* Mode demo (tanpa RESEND_API_KEY): token dikembalikan agar UI bisa lanjut. */
    console.log(`[auth] password reset requested for ${email} — token: ${token}`);
    return res.json({ ...generic, demo: { resetToken: token, expiresInMinutes: 15 } });
  },

  /** Step 2 — set a new password with a valid token. Returns a session (auto-login). */
  async resetPassword(req, res) {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'token and password required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = UserModel.findByResetToken(token);
    if (!user || !user.resetExpires || user.resetExpires < Date.now()) {
      return res.status(400).json({ error: 'Reset token is invalid or has expired' });
    }
    const hash = await hashPassword(password);
    const updated = UserModel.updatePassword(user.id, hash);
    return res.json(makeAuthResponse(updated));
  },

  /** Google SSO. Dengan GOOGLE_CLIENT_ID terpasang, kredensial (JWT Google)
   *  diverifikasi server-side terhadap kunci publik Google — profil diambil
   *  dari payload terverifikasi, bukan dari klien. Tanpa env → mode demo. */
  async googleSso(req, res) {
    let { email, name, picture, sub, credential } = req.body || {};

    if (googleClient) {
      if (!credential) return res.status(401).json({ error: 'Google credential required' });
      try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
        const p = ticket.getPayload();
        email = p.email; name = p.name; picture = p.picture; sub = p.sub;
      } catch (e) {
        console.error('[auth] Google credential verification failed:', e.message);
        return res.status(401).json({ error: 'Invalid Google credential' });
      }
    }

    if (!email) return res.status(400).json({ error: 'email required' });

    let user = UserModel.findByEmail(email);
    if (!user) {
      const role = /admin/i.test(email) ? 'admin' : 'bidder';
      user = UserModel.create({
        email,
        passwordHash: null,
        name: name || email.split('@')[0],
        role,
        picture,
        provider: 'google',
        kycVerified: true,        // demo: trust verified Google email as KYC
      });
      user = UserModel.markEmailVerified(user.id);  // email dijamin Google
      /* Pendaftaran pertama via SSO → email selamat datang. */
      if (resend) {
        sendWelcomeEmail(user.email, user.name)
          .then(() => console.log(`[auth] welcome email sent to ${user.email}`))
          .catch(e => console.error(`[auth] welcome email FAILED for ${user.email}:`, e.message));
      }
    } else if (picture && picture !== user.picture) {
      user = UserModel.updateProfile(user.id, { picture });
    }
    return res.json(makeAuthResponse(user));
  },

  /** Kirim OTP 6 digit ke nomor WhatsApp user yang sedang login.
   *  body.phone opsional — untuk mengisi/mengganti nomor (mis. akun SSO). */
  async sendPhoneOtp(req, res) {
    let user = req.user;
    const { phone } = req.body || {};

    if (phone) {
      const norm = normalizeIndoPhone(phone);
      if (!norm) return res.status(400).json({ error: 'Nomor WhatsApp tidak valid — gunakan format 08xx / +62xx' });
      const owner = UserModel.findByPhone(norm);
      if (owner && owner.id !== user.id) return res.status(409).json({ error: 'Nomor WhatsApp sudah terdaftar di akun lain' });
      user = UserModel.setPhone(user.id, norm);
    }
    if (!user.phone) return res.status(400).json({ error: 'Akun belum memiliki nomor WhatsApp' });
    if (user.phoneVerified) return res.json({ ok: true, alreadyVerified: true });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    UserModel.setPhoneOtp(user.id, otp, Date.now() + PHONE_OTP_TTL_MS);
    const delivered = await sendWhatsAppOtp(user.phone, otp);
    return res.json({
      ok: true,
      phone: user.phone,
      expiresInMinutes: 5,
      /* Mode demo (penyedia WA belum terpasang): OTP dikembalikan agar alur bisa diuji. */
      ...(delivered ? {} : { demo: { otp } }),
    });
  },

  /** Cocokkan OTP → tandai nomor terverifikasi. */
  async verifyPhone(req, res) {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'code required' });

    const saved = UserModel.getPhoneOtp(req.user.id);
    if (!saved?.otp || !saved.expires || saved.expires < Date.now()) {
      return res.status(400).json({ error: 'Kode OTP kedaluwarsa — kirim ulang kode baru' });
    }
    if (String(code).trim() !== saved.otp) {
      return res.status(400).json({ error: 'Kode OTP salah' });
    }
    const updated = UserModel.markPhoneVerified(req.user.id);
    console.log(`[auth] phone verified: ${updated.email} (${updated.phone})`);
    return res.json({ user: UserModel.toPublic(updated) });
  },

  async me(req, res) {
    return res.json({ user: UserModel.toPublic(req.user) });
  },
};
