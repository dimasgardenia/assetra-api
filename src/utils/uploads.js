/* Penyaring tipe berkas untuk multer. Hanya tipe yang tercantum yang disimpan,
   dicek dari MIME maupun ekstensi, supaya berkas HTML/JS tidak pernah tersaji
   dari /files (stored XSS). Error diberi status 400 agar tidak jadi 500. */
import path from 'path';

const IMAGE = { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif'] };
const DOC   = { mimes: ['application/pdf', 'image/jpeg', 'image/png'],          exts: ['.pdf', '.jpg', '.jpeg', '.png'] };

function makeFilter(allowed, label) {
  return (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const ok = allowed.mimes.includes((file.mimetype || '').toLowerCase()) && allowed.exts.includes(ext);
    if (ok) return cb(null, true);
    const e = new Error(`Tipe berkas tidak didukung — ${label}`);
    e.status = 400;
    cb(e);
  };
}

export const imageFileFilter    = makeFilter(IMAGE, 'gunakan JPG, PNG, WEBP, atau GIF');
export const documentFileFilter = makeFilter(DOC, 'gunakan PDF, JPG, atau PNG');
