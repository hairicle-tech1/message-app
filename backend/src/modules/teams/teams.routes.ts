import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as teamsController from './teams.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', asyncHandler(teamsController.createTeamHandler));
router.get('/', asyncHandler(teamsController.listMyTeamsHandler));
router.get('/:id', asyncHandler(teamsController.getTeamHandler));
router.patch('/:id', asyncHandler(teamsController.updateTeamHandler));
router.delete('/:id', asyncHandler(teamsController.deleteTeamHandler));
router.get('/:id/members', asyncHandler(teamsController.listTeamMembersHandler));
router.post('/:id/members', asyncHandler(teamsController.addTeamMemberHandler));
router.delete('/:id/members/:userId', asyncHandler(teamsController.removeTeamMemberHandler));
router.patch('/:id/members/:userId/role', asyncHandler(teamsController.updateMemberRoleHandler));

export default router;
