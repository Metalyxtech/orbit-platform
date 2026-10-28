import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/types';
import { names } from './names';

/** Section 7.2: one private bucket per environment, keys under {companyId}/. */
export class StorageStack extends Stack {
  readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StackProps & { cfg: StageConfig }) {
    super(scope, id, props);
    const n = names(props.cfg);

    this.bucket = new s3.Bucket(this, 'Files', {
      bucketName: n.bucket,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedOrigins: props.cfg.corsOrigins,
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedHeaders: ['content-type'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        // Exports live under {companyId}/timesheet/exports/; the exporter tags them retention=export.
        { id: 'exports-7-days', tagFilters: { retention: 'export' }, expiration: Duration.days(7) },
        { id: 'noncurrent-30-days', noncurrentVersionExpiration: Duration.days(30) },
        { id: 'abort-uploads', abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
    });

    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName, description: 'APP_S3_BUCKET' });
  }
}
