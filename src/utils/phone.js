/* Normalisasi & validasi nomor WhatsApp Indonesia.
   Menerima 08xx…, 62xx…, +62xx… → disimpan seragam sebagai +62xx… */

export function normalizeIndoPhone(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s\-().]/g, '');
  let n = null;
  if (/^\+62\d+$/.test(digits)) n = digits;
  else if (/^62\d+$/.test(digits)) n = '+' + digits;
  else if (/^08\d+$/.test(digits)) n = '+62' + digits.slice(1);
  if (!n) return null;
  const len = n.length - 3; // digit setelah +62
  if (len < 8 || len > 12) return null; // 08xx: 10–14 digit total
  return n;
}
