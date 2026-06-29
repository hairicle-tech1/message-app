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
      forcePathStyle: true, // required for MinIO path-style URLs
    })
  : null;

export const BUCKET = env.minioBucket;

// true when MinIO/S3 is configured, false = local disk fallback
export const useObjectStorage = s3 !== null;

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3!.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectStream(key: string): Promise<Readable> {
  const response = await s3!.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return response.Body as Readable;
}
