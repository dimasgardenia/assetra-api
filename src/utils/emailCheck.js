/* Validasi email sebelum menyentuh Resend: format + keberadaan MX record
   pada domain. Email dengan domain fiktif tidak pernah memicu pengiriman —
   menghemat kuota, menjaga reputasi domain pengirim, dan mempersempit abuse. */
import dns from 'dns/promises';

const mxCache = new Map(); // domain → { ok, at }
const MX_CACHE_TTL = 60 * 60 * 1000; // 1 jam

export function isEmailFormatValid(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** true bila domain email punya MX record (bisa menerima email). */
export async function domainAcceptsEmail(email) {
  const domain = String(email).split('@')[1]?.toLowerCase();
  if (!domain) return false;
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.at < MX_CACHE_TTL) return cached.ok;
  let ok = false;
  try {
    const mx = await dns.resolveMx(domain);
    ok = Array.isArray(mx) && mx.length > 0;
  } catch {
    ok = false; // NXDOMAIN / tanpa MX → tidak bisa menerima email
  }
  mxCache.set(domain, { ok, at: Date.now() });
  return ok;
}
