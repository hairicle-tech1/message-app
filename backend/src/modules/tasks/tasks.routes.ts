import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();
router.use(requireAuth);

export default router;
