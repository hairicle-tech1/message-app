import { Router } from 'express';
import multer from 'multer';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as filesController from './files.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSizeBytes },
});

const router = Router();

router.use(requireAuth);

router.post('/', upload.single('file'), asyncHandler(filesController.uploadFileHandler));
router.get('/:id', asyncHandler(filesController.downloadFileHandler));

export default router;
