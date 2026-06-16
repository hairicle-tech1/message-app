import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  completeTotpLoginHandler,
  loginHandler,
  meHandler,
  totpDisableHandler,
  totpEnableHandler,
  totpSetupHandler,
} from './auth.controller.js';

const router = Router();

router.post('/login', asyncHandler(loginHandler));
router.post('/login/totp', asyncHandler(completeTotpLoginHandler));
router.get('/me', requireAuth, asyncHandler(meHandler));

// TOTP management (requires full auth — not totp_pending)
router.post('/totp/setup', requireAuth, asyncHandler(totpSetupHandler));
router.post('/totp/enable', requireAuth, asyncHandler(totpEnableHandler));
router.delete('/totp', requireAuth, asyncHandler(totpDisableHandler));

export default router;
