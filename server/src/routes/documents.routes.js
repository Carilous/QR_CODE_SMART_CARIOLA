import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  previewDocument,
  replaceDocument,
  updateDocument,
  validateDocumentDestination,
  verifyDocumentDestination,
} from '../controllers/documents.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const maxFileSize = Number(process.env.MAX_UPLOAD_BYTES) || 25 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 1 },
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Upload limit reached. Try again later.' },
});

router.use(requireAuth);
router.get('/', listDocuments);
router.post('/', uploadLimiter, upload.single('file'), createDocument);
router.post('/:id/validate-url', validateDocumentDestination);
router.post('/:id/check-url', verifyDocumentDestination);
router.get('/:id/preview', previewDocument);
router.post('/:id/replace', uploadLimiter, upload.single('file'), replaceDocument);
router.get('/:id', getDocument);
router.patch('/:id', updateDocument);
router.delete('/:id', deleteDocument);

export default router;