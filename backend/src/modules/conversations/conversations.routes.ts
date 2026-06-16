import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as conversationsController from './conversations.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', asyncHandler(conversationsController.createConversationHandler));
router.get('/', asyncHandler(conversationsController.listConversationsHandler));
router.get('/channels/all', asyncHandler(conversationsController.listAllChannelsHandler));
router.post('/:id/subscribe', asyncHandler(conversationsController.subscribeToChannelHandler));
router.delete('/:id/subscribe', asyncHandler(conversationsController.unsubscribeFromChannelHandler));
router.get('/:id', asyncHandler(conversationsController.getConversationHandler));
router.get('/:id/media', asyncHandler(conversationsController.getConversationMediaHandler));
router.get('/:id/attachments', asyncHandler(conversationsController.getConversationAttachmentsHandler));
router.post('/:id/members', asyncHandler(conversationsController.addMemberHandler));
router.delete('/:id/members/:userId', asyncHandler(conversationsController.removeMemberHandler));
router.get('/:id/mute', asyncHandler(conversationsController.getMuteStatusHandler));
router.put('/:id/mute', asyncHandler(conversationsController.muteConversationHandler));
router.delete('/:id/mute', asyncHandler(conversationsController.unmuteConversationHandler));
router.get('/:id/pins', asyncHandler(conversationsController.listPinnedMessagesHandler));
router.post('/:id/pins', asyncHandler(conversationsController.pinMessageHandler));
router.delete('/:id/pins/:messageId', asyncHandler(conversationsController.unpinMessageHandler));

export default router;
