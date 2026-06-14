import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { loginHandler, meHandler } from './auth.controller.js';

const router = Router();

router.post('/login', asyncHandler(loginHandler));
router.get('/me', requireAuth, asyncHandler(meHandler));

export default router;
