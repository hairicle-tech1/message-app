import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as messagesController from './messages.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', asyncHandler(messagesController.sendMessageHandler));
router.get('/', asyncHandler(messagesController.listMessagesHandler));
router.post('/:id/read', asyncHandler(messagesController.markReadHandler));
router.patch('/:id', asyncHandler(messagesController.editMessageHandler));
router.delete('/:id', asyncHandler(messagesController.deleteMessageHandler));

export default router;
