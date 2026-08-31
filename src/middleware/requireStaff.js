/* Izinkan admin ATAU agen terverifikasi (accountType 'agent' + email verified
   + kartu agen berstatus 'live'). Dipakai untuk data yang boleh diakses staf
   panel (prospek, KPR, daftar agen) — dipakai setelah authRequired. */
import { AgentModel } from '../models/Agent.js';

export function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role === 'admin') return next();
  const isAgentAccount = req.user.accountType === 'agent' && req.user.emailVerified;
  if (isAgentAccount) {
    const agent = AgentModel.getByEmail(req.user.email);
    if (agent && agent.status === 'live') return next();
  }
  return res.status(403).json({ error: 'Requires admin or verified agent' });
}
