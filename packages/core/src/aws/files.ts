import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from './clients';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const bucket = () => {
  const b = process.env.APP_S3_BUCKET;
  if (!b) throw new Error('APP_S3_BUCKET is not set');
  return b;
};

/** Every key lives under the company prefix (Section 7.2), so purge and access checks are prefix based. */
export function companyKey(companyId: string, ...parts: string[]) {
  return [companyId, ...parts].join('/');
}

/** Pre-signed browser PUT, valid 5 minutes. Type and size are checked here, server side. */
export async function presignUpload(key: string, contentType: string, size: number) {
  if (!ALLOWED_TYPES.has(contentType)) throw new Error('File type not allowed');
  if (size > MAX_UPLOAD_BYTES) throw new Error('File is larger than 10 MB');
  return getSignedUrl(
    s3Client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 300 },
  );
}

export async function presignDownload(key: string, expiresIn = 300) {
  return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}
