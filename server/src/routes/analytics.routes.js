import { Router } from 'express';
import {
  getDocumentAnalytics,
  getOverview,
  getQrAnalytics,
  getScans,
} from '../controllers/analytics.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/overview', getOverview);
router.get('/scans', getScans);
router.get('/documents', getDocumentAnalytics);
router.get('/qr/:id', getQrAnalytics);

export default router;