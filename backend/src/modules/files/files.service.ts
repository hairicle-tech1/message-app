import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import sharp from 'sharp';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/error.middleware.js';
import { assertMember } from '../conversations/conversations.service.js';

const uploadsRoot = path.resolve(env.uploadsDir);
const thumbnailsRoot = path.join(uploadsRoot, 'thumbnails');
const THUMBNAIL_MAX_DIMENSION = 320;

export interface FileMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hasThumbnail: boolean;
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
  has_thumbnail: boolean;
  created_at: string;
}

export function resolveStoragePath(storageKey: string): string {
  return path.join(uploadsRoot, storageKey);
}

export function resolveThumbnailPath(fileId: string): string {
  return path.join(thumbnailsRoot, `${fileId}.webp`);
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
     RETURNING id, file_name, mime_type, size_bytes, has_thumbnail, created_at`,
    [uploaderId, storageKey, file.originalName, file.mimeType, file.size],
  );

  const row = result.rows[0];

  if (file.mimeType.startsWith('image/')) {
    const generated = await generateThumbnail(row.id, file.buffer);
    if (generated) {
      await db.query('UPDATE files SET has_thumbnail = TRUE WHERE id = $1', [row.id]);
      row.has_thumbnail = true;
    }
  }

  return toFileMeta(row);
}

async function generateThumbnail(fileId: string, buffer: Buffer): Promise<boolean> {
  try {
    if (!existsSync(thumbnailsRoot)) {
      mkdirSync(thumbnailsRoot, { recursive: true });
    }
    const thumbnail = await sharp(buffer)
      .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    await fs.writeFile(resolveThumbnailPath(fileId), thumbnail);
    return true;
  } catch {
    return false;
  }
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
     RETURNING id, file_name, mime_type, size_bytes, has_thumbnail, created_at`,
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

type FileRecord = FileRow & { storage_key: string; uploader_id: string; conversation_id: string | null };

async function loadAuthorizedFile(fileId: string, userId: string): Promise<FileRecord> {
  const result = await db.query<FileRecord>(
    `SELECT f.id, f.storage_key, f.file_name, f.mime_type, f.size_bytes, f.has_thumbnail, f.uploader_id, f.created_at,
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

  return file;
}

export async function getFileForDownload(fileId: string, userId: string): Promise<DownloadableFile> {
  const file = await loadAuthorizedFile(fileId, userId);

  return {
    storagePath: resolveStoragePath(file.storage_key),
    fileName: file.file_name,
    mimeType: file.mime_type,
    sizeBytes: Number(file.size_bytes),
  };
}

export async function getThumbnailForDownload(fileId: string, userId: string): Promise<string> {
  const file = await loadAuthorizedFile(fileId, userId);

  if (!file.has_thumbnail) {
    throw new HttpError(404, 'No thumbnail available for this file');
  }

  return resolveThumbnailPath(file.id);
}

export interface ConversationMediaItem {
  messageId: string;
  type: string;
  createdAt: string;
  file: FileMeta;
}

export interface ConversationAttachmentItem {
  messageId: string;
  type: string;
  createdAt: string;
  senderId: string;
  file: FileMeta;
}

export async function getConversationMedia(conversationId: string, userId: string): Promise<ConversationMediaItem[]> {
  await assertMember(conversationId, userId);

  const result = await db.query<FileRow & { message_id: string; message_type: string; message_created_at: string }>(
    `SELECT f.id, f.file_name, f.mime_type, f.size_bytes, f.has_thumbnail, f.created_at,
            m.id AS message_id, m.type AS message_type, m.created_at AS message_created_at
     FROM files f
     JOIN messages m ON m.id = f.message_id
     WHERE m.conversation_id = $1 AND m.type IN ('image', 'video') AND m.deleted_at IS NULL
     ORDER BY m.created_at DESC
     LIMIT 200`,
    [conversationId],
  );

  return result.rows.map((row) => ({
    messageId: row.message_id,
    type: row.message_type,
    createdAt: row.message_created_at,
    file: toFileMeta(row),
  }));
}

export async function getConversationAttachments(
  conversationId: string,
  userId: string,
  types: string[],
): Promise<ConversationAttachmentItem[]> {
  await assertMember(conversationId, userId);

  const placeholders = types.map((_, i) => `$${i + 2}`).join(', ');
  const result = await db.query<
    FileRow & { message_id: string; message_type: string; message_created_at: string; sender_id: string }
  >(
    `SELECT f.id, f.file_name, f.mime_type, f.size_bytes, f.has_thumbnail, f.created_at,
            m.id AS message_id, m.type AS message_type, m.created_at AS message_created_at, m.sender_id
     FROM files f
     JOIN messages m ON m.id = f.message_id
     WHERE m.conversation_id = $1 AND m.type IN (${placeholders}) AND m.deleted_at IS NULL
     ORDER BY m.created_at DESC
     LIMIT 200`,
    [conversationId, ...types],
  );

  return result.rows.map((row) => ({
    messageId: row.message_id,
    type: row.message_type,
    createdAt: row.message_created_at,
    senderId: row.sender_id,
    file: toFileMeta(row),
  }));
}

function toFileMeta(row: FileRow): FileMeta {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    hasThumbnail: row.has_thumbnail,
    createdAt: row.created_at,
  };
}
