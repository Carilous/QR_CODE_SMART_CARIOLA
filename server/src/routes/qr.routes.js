import { Router } from 'express';
import {
  changeDestination,
  createQr,
  deleteQr,
  downloadQr,
  getQr,
  listQrs,
  updateQr,
} from '../controllers/qr.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listQrs);
router.post('/', createQr);
router.post('/:id/change-destination', changeDestination);
router.get('/:id/download', downloadQr);
router.get('/:id', getQr);
router.put('/:id', updateQr);
router.delete('/:id', deleteQr);

export default router;