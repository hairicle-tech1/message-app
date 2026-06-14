import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/error.middleware.js';
import { assertMember } from '../conversations/conversations.service.js';

const uploadsRoot = path.resolve(env.uploadsDir);

export interface FileMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface UploadedFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

interface FileRow {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: string;
  created_at: string;
}

export function resolveStoragePath(storageKey: string): string {
  return path.join(uploadsRoot, storageKey);
}

export async function saveUploadedFile(uploaderId: string, file: UploadedFileInput): Promise<FileMeta> {
  if (!existsSync(uploadsRoot)) {
    mkdirSync(uploadsRoot, { recursive: true });
  }

  const storageKey = `${randomUUID()}${path.extname(file.originalName)}`;
  await fs.writeFile(resolveStoragePath(storageKey), file.buffer);

  const result = await db.query<FileRow>(
    `INSERT INTO files (uploader_id, storage_key, file_name, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, file_name, mime_type, size_bytes, created_at`,
    [uploaderId, storageKey, file.originalName, file.mimeType, file.size],
  );

  return toFileMeta(result.rows[0]);
}

export async function attachFileToMessage(
  client: Pool | PoolClient,
  fileId: string,
  messageId: string,
  uploaderId: string,
): Promise<FileMeta> {
  const result = await client.query<FileRow>(
    `UPDATE files SET message_id = $1
     WHERE id = $2 AND uploader_id = $3 AND message_id IS NULL
     RETURNING id, file_name, mime_type, size_bytes, created_at`,
    [messageId, fileId, uploaderId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new HttpError(400, 'Invalid file attachment');
  }

  return toFileMeta(row);
}

interface DownloadableFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function getFileForDownload(fileId: string, userId: string): Promise<DownloadableFile> {
  const result = await db.query<FileRow & { storage_key: string; uploader_id: string; conversation_id: string | null }>(
    `SELECT f.id, f.storage_key, f.file_name, f.mime_type, f.size_bytes, f.uploader_id, f.created_at,
            m.conversation_id
     FROM files f
     LEFT JOIN messages m ON m.id = f.message_id
     WHERE f.id = $1`,
    [fileId],
  );

  const file = result.rows[0];
  if (!file) {
    throw new HttpError(404, 'File not found');
  }

  if (file.conversation_id) {
    await assertMember(file.conversation_id, userId);
  } else if (file.uploader_id !== userId) {
    throw new HttpError(403, 'Not authorized to access this file');
  }

  return {
    storagePath: resolveStoragePath(file.storage_key),
    fileName: file.file_name,
    mimeType: file.mime_type,
    sizeBytes: Number(file.size_bytes),
  };
}

function toFileMeta(row: FileRow): FileMeta {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
  };
}
