/* Membutuhkan email terverifikasi (dipakai setelah authRequired).
   Akun yang login tapi email belum diverifikasi ditolak — tidak boleh
   memakai fitur AI atau melihat nomor kontak. */
export function requireVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.user.emailVerified) {
    return res.status(403).json({ error: 'Email belum diverifikasi', code: 'EMAIL_UNVERIFIED' });
  }
  next();
}
