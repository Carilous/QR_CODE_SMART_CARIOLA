import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  bootstrapSuperAdmin,
  currentUser,
  forgotPassword,
  login,
  logout,
  register,
  resetPassword,
  updateCurrentUser,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many password recovery attempts. Try again later.' },
});

const bootstrapLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many bootstrap attempts. Try again later.' },
});

router.post('/register', loginLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAuth, currentUser);
router.patch('/me', requireAuth, updateCurrentUser);
router.post('/forgot-password', recoveryLimiter, forgotPassword);
router.post('/reset-password', recoveryLimiter, resetPassword);
router.post('/bootstrap-admin', bootstrapLimiter, bootstrapSuperAdmin);

export default router;