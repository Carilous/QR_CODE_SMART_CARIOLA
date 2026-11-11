import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  grantQrPassword,
  grantSlugPassword,
  redirectCustomUrl,
  redirectQr,
  resolveQr,
  resolvePublicSlug,
  streamQrDocument,
  streamSlugDocument,
} from '../controllers/public.controller.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many password attempts. Try again later.' },
});

router.get(['/r/:uniqueCode', '/r/:uniqueCode/{*rest}'], optionalAuth, redirectQr);
router.get(['/d/:slug', '/d/:slug/{*rest}'], optionalAuth, redirectCustomUrl);
router.get('/api/public/qr/:uniqueCode', optionalAuth, resolveQr);
router.get('/api/public/qr/:uniqueCode/file', optionalAuth, streamQrDocument);
router.post('/api/public/qr/:uniqueCode/access', passwordLimiter, grantQrPassword);
router.get('/api/public/urls/:slug', optionalAuth, resolvePublicSlug);
router.get('/api/public/urls/:slug/file', optionalAuth, streamSlugDocument);
router.post('/api/public/urls/:slug/access', passwordLimiter, grantSlugPassword);

export default router;