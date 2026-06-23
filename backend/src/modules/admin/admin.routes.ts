import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as adminController from './admin.controller.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/audit-logs', asyncHandler(adminController.listAuditLogsHandler));
router.get('/stats', asyncHandler(adminController.getStatsHandler));
router.post('/sync-department-teams', asyncHandler(adminController.syncDepartmentTeamsHandler));

export default router;
