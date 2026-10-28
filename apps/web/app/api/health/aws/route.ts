import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { getSecret, region, s3Client } from '@orbit/core/aws';

export const dynamic = 'force-dynamic';

/**
 * Week-1 check (Section 5.3): proves the app reaches AWS through the compute role
 * (or Vercel OIDC) by listing one S3 key and reading one SSM parameter. No values are returned.
 */
export async function GET() {
  const result: Record<string, string> = { hosting: process.env.HOSTING ?? 'amplify', stage: process.env.APP_STAGE ?? '', region };
  let ok = true;
  try {
    await s3Client().send(new ListObjectsV2Command({ Bucket: process.env.APP_S3_BUCKET, MaxKeys: 1 }));
    result.s3 = 'ok';
  } catch (err) {
    ok = false;
    result.s3 = (err as Error).name;
  }
  try {
    await getSecret('timerHmacSecret');
    result.ssm = 'ok';
  } catch (err) {
    ok = false;
    result.ssm = (err as Error).name || 'error';
  }
  return NextResponse.json(result, { status: ok ? 200 : 500 });
}
