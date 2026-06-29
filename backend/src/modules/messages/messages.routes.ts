import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as messagesController from './messages.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', asyncHandler(messagesController.sendMessageHandler));
router.get('/', asyncHandler(messagesController.listMessagesHandler));
router.get('/search', asyncHandler(messagesController.searchMessagesHandler));
router.get('/undelivered', asyncHandler(messagesController.getUndeliveredHandler));
router.get('/pinned', asyncHandler(messagesController.getPinnedHandler));
router.get('/bookmarks', asyncHandler(messagesController.getUserBookmarksHandler));
router.post('/:id/read', asyncHandler(messagesController.markReadHandler));
router.get('/:id/receipts', asyncHandler(messagesController.getReceiptsHandler));
router.post('/:id/reactions', asyncHandler(messagesController.addReactionHandler));
router.delete('/:id/reactions/:emoji', asyncHandler(messagesController.removeReactionHandler));
router.post('/:id/pin', asyncHandler(messagesController.pinMessageHandler));
router.delete('/:id/pin', asyncHandler(messagesController.unpinMessageHandler));
router.post('/:id/bookmark', asyncHandler(messagesController.bookmarkMessageHandler));
router.delete('/:id/bookmark', asyncHandler(messagesController.unbookmarkMessageHandler));
router.post('/:id/forward', asyncHandler(messagesController.forwardMessageHandler));
router.patch('/:id', asyncHandler(messagesController.editMessageHandler));
router.delete('/:id', asyncHandler(messagesController.deleteMessageHandler));

export default router;
