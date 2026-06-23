import type { Request, Response } from 'express';
import { HttpError } from '../../middleware/error.middleware.js';
import * as filesService from './files.service.js';

export async function uploadFileHandler(req: Request, res: Response) {
  if (!req.file) throw new HttpError(400, 'No file uploaded');

  const file = await filesService.saveUploadedFile(req.user!.id, {
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });

  res.status(201).json({ file });
}

export async function uploadVoiceHandler(req: Request, res: Response) {
  if (!req.file) throw new HttpError(400, 'No audio file uploaded');

  const file = await filesService.saveVoiceNote(req.user!.id, {
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });

  res.status(201).json({ file });
}

export async function downloadFileHandler(req: Request, res: Response) {
  const { stream, fileName, mimeType, sizeBytes } = await filesService.getFileForDownload(
    req.params.id,
    req.user!.id,
  );

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(sizeBytes));
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  stream.pipe(res);
}

export async function downloadThumbnailHandler(req: Request, res: Response) {
  const stream = await filesService.getThumbnailForDownload(req.params.id, req.user!.id);

  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  stream.pipe(res);
}
