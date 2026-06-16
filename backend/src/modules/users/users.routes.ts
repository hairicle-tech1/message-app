import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  changePasswordHandler,
  createUserHandler,
  getMyProfileHandler,
  getNotificationPrefsHandler,
  getUserAvatarHandler,
  listDirectoryHandler,
  listUsersHandler,
  updateAvatarHandler,
  updateNotificationPrefsHandler,
  updateProfileHandler,
} from './users.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.use(requireAuth);

// Own profile
router.get('/me', asyncHandler(getMyProfileHandler));
router.patch('/me', asyncHandler(updateProfileHandler));
router.post('/me/avatar', upload.single('avatar'), asyncHandler(updateAvatarHandler));
router.post('/me/password', asyncHandler(changePasswordHandler));
router.get('/me/notifications', asyncHandler(getNotificationPrefsHandler));
router.patch('/me/notifications', asyncHandler(updateNotificationPrefsHandler));

// Avatar by user ID (any authenticated user can fetch)
router.get('/:userId/avatar', asyncHandler(getUserAvatarHandler));

// Directory — any authenticated user can browse
router.get('/directory', asyncHandler(listDirectoryHandler));

// Closed registration: only admins can list/create accounts
router.get('/', requireRole('admin'), asyncHandler(listUsersHandler));
router.post('/', requireRole('admin'), asyncHandler(createUserHandler));

export default router;
