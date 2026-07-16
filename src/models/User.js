import { db } from '../config/db.js';

const PUBLIC_COLS = 'id, email, name, role, account_type AS accountType, kyc_verified AS kycVerified, email_verified AS emailVerified, phone, phone_verified AS phoneVerified, picture, provider, created_at AS createdAt';

export const UserModel = {
  findById(id) {
    return db.prepare(`SELECT ${PUBLIC_COLS}, password_hash AS passwordHash FROM users WHERE id = ?`).get(id);
  },
  findByEmail(email) {
    return db.prepare(`SELECT ${PUBLIC_COLS}, password_hash AS passwordHash FROM users WHERE email = ?`).get(email);
  },
  toPublic(row) {
    if (!row) return null;
    const { passwordHash, password_hash, resetExpires, verifyExpires, ...rest } = row;
    return { ...rest, kycVerified: !!rest.kycVerified, emailVerified: !!rest.emailVerified, phoneVerified: !!rest.phoneVerified };
  },
  findByPhone(phone) {
    return db.prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE phone = ?`).get(phone);
  },
  setPhone(id, phone) {
    db.prepare('UPDATE users SET phone = ?, phone_verified = 0 WHERE id = ?').run(phone, id);
    return UserModel.findById(id);
  },
  setPhoneOtp(id, otp, expiresAt) {
    db.prepare('UPDATE users SET phone_otp = ?, phone_otp_expires = ? WHERE id = ?').run(otp, expiresAt, id);
  },
  getPhoneOtp(id) {
    return db.prepare('SELECT phone_otp AS otp, phone_otp_expires AS expires FROM users WHERE id = ?').get(id);
  },
  markPhoneVerified(id) {
    db.prepare('UPDATE users SET phone_verified = 1, phone_otp = NULL, phone_otp_expires = NULL WHERE id = ?').run(id);
    return UserModel.findById(id);
  },
  create({ email, passwordHash, name, role = 'bidder', accountType = null, picture = null, provider = 'email', kycVerified = false, phone = null }) {
    const r = db.prepare(`
      INSERT INTO users (email, password_hash, name, role, account_type, picture, provider, kyc_verified, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(email, passwordHash, name, role, accountType, picture, provider, kycVerified ? 1 : 0, phone);
    return UserModel.findById(r.lastInsertRowid);
  },
  setResetToken(id, token, expiresAt) {
    db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(token, expiresAt, id);
  },
  setVerifyToken(id, token, expiresAt) {
    db.prepare('UPDATE users SET verify_token = ?, verify_expires = ? WHERE id = ?').run(token, expiresAt, id);
  },
  findByVerifyToken(token) {
    return db.prepare(`SELECT ${PUBLIC_COLS}, verify_expires AS verifyExpires FROM users WHERE verify_token = ?`).get(token);
  },
  markEmailVerified(id) {
    db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?').run(id);
    return UserModel.findById(id);
  },
  findByResetToken(token) {
    return db.prepare(`SELECT ${PUBLIC_COLS}, password_hash AS passwordHash, reset_expires AS resetExpires FROM users WHERE reset_token = ?`).get(token);
  },
  updatePassword(id, passwordHash) {
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?').run(passwordHash, id);
    return UserModel.findById(id);
  },
  updateProfile(id, { name, picture, accountType, kycVerified }) {
    db.prepare(`
      UPDATE users SET
        name = COALESCE(?, name),
        picture = COALESCE(?, picture),
        account_type = COALESCE(?, account_type),
        kyc_verified = COALESCE(?, kyc_verified)
      WHERE id = ?
    `).run(name ?? null, picture ?? null, accountType ?? null, kycVerified == null ? null : (kycVerified ? 1 : 0), id);
    return UserModel.findById(id);
  },
};
