import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as adminController from './admin.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/audit-logs', asyncHandler(adminController.listAuditLogsHandler));
router.get('/stats', asyncHandler(adminController.getStatsHandler));
router.post('/sync-department-teams', asyncHandler(adminController.syncDepartmentTeamsHandler));
router.patch('/users/:userId', asyncHandler(adminController.adminUpdateUserHandler));
router.delete('/users/:userId', asyncHandler(adminController.adminDeleteUserHandler));
router.post('/users/import', upload.single('file'), asyncHandler(adminController.importUsersHandler));

export default router;
