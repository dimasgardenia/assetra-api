/* Verifies "Authorization: Bearer <token>", attaches req.user if valid. */
import { verifyToken } from '../utils/jwt.js';
import { UserModel } from '../models/User.js';

export function authOptional(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return next();
  const payload = verifyToken(token);
  if (payload?.sub) {
    const user = UserModel.findById(payload.sub);
    if (user) req.user = user;
  }
  next();
}

export function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const payload = verifyToken(token);
  if (!payload?.sub) return res.status(401).json({ error: 'Invalid token' });
  const user = UserModel.findById(payload.sub);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
}
