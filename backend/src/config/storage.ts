import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { env } from './env.js';

export const s3 = env.minioEndpoint
  ? new S3Client({
      endpoint: env.minioEndpoint,
      region: env.minioRegion,
      credentials: {
        accessKeyId: env.minioAccessKey!,
        secretAccessKey: env.minioSecretKey!,
      },
      forcePathStyle: true,
    })
  : null;

export const BUCKET = env.minioBucket;
export const AVATAR_BUCKET = env.avatarBucket;

// true when S3-compatible storage is configured, false = local disk fallback
export const useObjectStorage = s3 !== null;

export async function putObject(key: string, body: Buffer, contentType: string, bucket = BUCKET): Promise<void> {
  await s3!.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectStream(key: string, bucket = BUCKET): Promise<Readable> {
  const response = await s3!.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body as Readable;
}

// Returns a public URL for Supabase Storage buckets (public buckets only)
export function getPublicUrl(bucket: string, key: string): string | null {
  const endpoint = env.minioEndpoint;
  if (!endpoint?.includes('supabase.co')) return null;
  const base = endpoint.replace('/storage/v1/s3', '');
  return `${base}/storage/v1/object/public/${bucket}/${key}`;
}
