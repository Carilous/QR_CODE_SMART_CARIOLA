import { Router } from 'express';
import {
  checkSlug,
  createUrl,
  deleteUrl,
  listUrls,
  updateUrl,
} from '../controllers/urls.controller.js';
import {
  validateDestination,
  verifyDestinationReachability,
} from '../controllers/urlValidation.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/check/:slug', checkSlug);
router.post('/validate', validateDestination);
router.post('/reachability', verifyDestinationReachability);
router.get('/', listUrls);
router.post('/', createUrl);
router.put('/:id', updateUrl);
router.delete('/:id', deleteUrl);

export default router;