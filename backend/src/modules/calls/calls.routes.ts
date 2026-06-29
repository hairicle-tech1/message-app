import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as callsController from './calls.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', asyncHandler(callsController.initiateCallHandler));
router.get('/', asyncHandler(callsController.getCallHistoryHandler));
router.get('/:id', asyncHandler(callsController.getCallHandler));
router.post('/:id/join', asyncHandler(callsController.joinCallHandler));
router.post('/:id/leave', asyncHandler(callsController.leaveCallHandler));
router.post('/:id/end', asyncHandler(callsController.endCallHandler));

export default router;
