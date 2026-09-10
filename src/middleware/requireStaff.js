/* Izinkan admin, agen terverifikasi (accountType 'agent' + email verified +
   kartu agen berstatus 'live'), ATAU pemilik properti (accountType 'owner' +
   email verified — tanpa persetujuan admin). Dipakai untuk data yang boleh
   diakses panel (listing sendiri, prospek, KPR, daftar agen) — setelah authRequired. */
import { AgentModel } from '../models/Agent.js';

export function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role === 'admin') return next();
  if (req.user.accountType === 'owner' && req.user.emailVerified) return next();
  const isAgentAccount = req.user.accountType === 'agent' && req.user.emailVerified;
  if (isAgentAccount) {
    const agent = AgentModel.getByEmail(req.user.email);
    if (agent && agent.status === 'live') return next();
  }
  return res.status(403).json({ error: 'Requires admin, verified agent, or verified property owner' });
}
