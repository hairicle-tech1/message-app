import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { createUserHandler, listDirectoryHandler, listUsersHandler } from './users.controller.js';

const router = Router();

router.use(requireAuth);

// Any authenticated user can browse the directory to start conversations
router.get('/directory', asyncHandler(listDirectoryHandler));

// Closed registration: only admins can list/create accounts
router.get('/', requireRole('admin'), asyncHandler(listUsersHandler));
router.post('/', requireRole('admin'), asyncHandler(createUserHandler));

export default router;
