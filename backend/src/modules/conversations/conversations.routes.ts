import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as conversationsController from './conversations.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', asyncHandler(conversationsController.createConversationHandler));
router.get('/', asyncHandler(conversationsController.listConversationsHandler));
router.get('/:id', asyncHandler(conversationsController.getConversationHandler));
router.get('/:id/media', asyncHandler(conversationsController.getConversationMediaHandler));
router.post('/:id/members', asyncHandler(conversationsController.addMemberHandler));
router.delete('/:id/members/:userId', asyncHandler(conversationsController.removeMemberHandler));

export default router;
