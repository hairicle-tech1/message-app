import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as deptController from './departments.controller.js';

const router = Router();

router.use(requireAuth);

// Anyone can list departments (needed for profile dropdown)
router.get('/', asyncHandler(deptController.listDepartmentsHandler));

// Only admins can manage departments
router.post('/', requireRole('admin'), asyncHandler(deptController.createDepartmentHandler));
router.patch('/:id', requireRole('admin'), asyncHandler(deptController.updateDepartmentHandler));
router.delete('/:id', requireRole('admin'), asyncHandler(deptController.deleteDepartmentHandler));

export default router;
