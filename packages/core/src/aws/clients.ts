import { S3Client } from '@aws-sdk/client-s3';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SSMClient } from '@aws-sdk/client-ssm';
import { credentials, region } from './credentials';

let s3: S3Client | undefined;
let sqs: SQSClient | undefined;
let ssm: SSMClient | undefined;
let scheduler: SchedulerClient | undefined;

export const s3Client = () => (s3 ??= new S3Client({ region, credentials }));
export const sqsClient = () => (sqs ??= new SQSClient({ region, credentials }));
export const ssmClient = () => (ssm ??= new SSMClient({ region, credentials }));
export const schedulerClient = () => (scheduler ??= new SchedulerClient({ region, credentials }));
