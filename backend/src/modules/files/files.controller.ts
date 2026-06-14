import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { HttpError } from '../../middleware/error.middleware.js';
import * as filesService from './files.service.js';

export async function uploadFileHandler(req: Request, res: Response) {
  if (!req.file) {
    throw new HttpError(400, 'No file uploaded');
  }

  const file = await filesService.saveUploadedFile(req.user!.id, {
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });

  res.status(201).json({ file });
}

export async function downloadFileHandler(req: Request, res: Response) {
  const file = await filesService.getFileForDownload(req.params.id, req.user!.id);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
  createReadStream(file.storagePath).pipe(res);
}

export async function downloadThumbnailHandler(req: Request, res: Response) {
  const thumbnailPath = await filesService.getThumbnailForDownload(req.params.id, req.user!.id);

  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  createReadStream(thumbnailPath).pipe(res);
}
