import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authRequired } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { wrap } from '../middleware/errorHandler.js';

const router = Router();

/* Rate limit per IP — endpoint pengirim email dibatasi ketat,
   login/verify sedikit lebih longgar (anti brute-force). */
const emailLimiter = rateLimit({ name: 'auth-email', windowMs: 15 * 60 * 1000, max: 5 });
const loginLimiter = rateLimit({ name: 'auth-login', windowMs: 10 * 60 * 1000, max: 15 });

router.post('/register', emailLimiter, wrap(authController.register));
router.post('/login', loginLimiter, wrap(authController.login));
router.post('/google', loginLimiter, wrap(authController.googleSso));
router.post('/forgot', emailLimiter, wrap(authController.forgotPassword));
router.post('/reset', loginLimiter, wrap(authController.resetPassword));
router.post('/verify-email', loginLimiter, wrap(authController.verifyEmail));
router.post('/send-verification', emailLimiter, wrap(authController.sendVerification));
router.post('/phone/send-otp', authRequired, emailLimiter, wrap(authController.sendPhoneOtp));
router.post('/phone/verify', authRequired, loginLimiter, wrap(authController.verifyPhone));
router.get('/me', authRequired, wrap(authController.me));

export default router;
