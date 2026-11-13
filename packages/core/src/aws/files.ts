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
  // Customers' own forms for custom work (Word documents and phone photos).
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/webp',
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

/**
 * Pre-signed browser PUT. Type and size are checked here, server side. A caller can narrow the
 * types and raise the size limit (e.g. 100 MB project PDFs); the link then lasts long enough to upload it.
 */
export async function presignUpload(key: string, contentType: string, size: number, opts: { maxBytes?: number; types?: string[] } = {}) {
  const max = opts.maxBytes ?? MAX_UPLOAD_BYTES;
  if (!(opts.types ? opts.types.includes(contentType) : ALLOWED_TYPES.has(contentType))) throw new Error('File type not allowed');
  if (size > max) throw new Error(`File is larger than ${Math.round(max / 1024 / 1024)} MB`);
  return getSignedUrl(
    s3Client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: max > MAX_UPLOAD_BYTES ? 3600 : 300 },
  );
}

export async function presignDownload(key: string, expiresIn = 300) {
  return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}
