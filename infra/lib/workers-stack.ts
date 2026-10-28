import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import type { StageConfig } from '../config/types';
import { names } from './names';

const root = fileURLToPath(new URL('../../', import.meta.url));

export interface WorkersStackProps extends StackProps {
  cfg: StageConfig;
  bucket: s3.IBucket;
  events: sqs.IQueue;
  exportsQueue: sqs.IQueue;
  purge: sqs.IQueue;
  sesIdentityArn: string;
  sesConfigurationSet: string;
}

/** Section 6: five Lambdas (Node.js 22, arm64, esbuild), event sources, timers group and sweep rule. */
export class WorkersStack extends Stack {
  readonly functions: Record<string, NodejsFunction> = {};

  constructor(scope: Construct, id: string, props: WorkersStackProps) {
    super(scope, id, props);
    const { cfg } = props;
    const n = names(cfg);

    const fn = (name: string, memorySize: number, timeoutSec: number) => {
      const logGroup = new logs.LogGroup(this, `${name}Logs`, {
        logGroupName: `/aws/lambda/${n.fn(name)}`,
        retention: cfg.logRetentionDays as logs.RetentionDays,
      });
      const f = new NodejsFunction(this, name, {
        functionName: n.fn(name),
        entry: `${root}workers/${name}/index.ts`,
        projectRoot: root,
        depsLockFilePath: `${root}pnpm-lock.yaml`,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize,
        timeout: Duration.seconds(timeoutSec),
        logGroup,
        bundling: {
          format: OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          target: 'node22',
          externalModules: ['@aws-sdk/*'], // provided by the Lambda runtime
        },
        environment: {
          STAGE: cfg.stage,
          PARAM_PREFIX: n.paramPrefix,
          APP_BASE_URL: cfg.appBaseUrl,
          EVENTS_QUEUE_URL: props.events.queueUrl,
          BUCKET: props.bucket.bucketName,
          SES_CONFIGURATION_SET: props.sesConfigurationSet,
          NODE_OPTIONS: '--enable-source-maps',
        },
      });
      // Every worker reads /orbit/<env>/workers/* (Neon URL, HMAC secret, from address).
      f.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
          resources: [n.arn.params('workers'), n.arn.params('workers/*')],
        }),
      );
      this.functions[name] = f;
      return f;
    };

    // notifier: SQS events (batch 10) -> SES
    const notifier = fn('notifier', 512, 30);
    notifier.addEventSource(new SqsEventSource(props.events, { batchSize: 10, reportBatchItemFailures: true }));
    notifier.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [props.sesIdentityArn, `arn:aws:ses:${cfg.region}:${this.account}:configuration-set/${props.sesConfigurationSet}`],
      }),
    );
    props.bucket.grantRead(notifier, '*/branding/*');

    // escalator: EventBridge Scheduler -> POST /api/internal/timer (HMAC)
    fn('escalator', 256, 15);

    // exporter: SQS exports -> .xlsx in S3 -> 'export ready' email via the events queue
    const exporter = fn('exporter', 1024, 120);
    exporter.addEventSource(new SqsEventSource(props.exportsQueue, { batchSize: 1, reportBatchItemFailures: true }));
    exporter.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:PutObjectTagging'],
        resources: [`${props.bucket.bucketArn}/*/timesheet/exports/*`],
      }),
    );
    props.events.grantSendMessages(exporter);

    // outbox-sweeper: EventBridge rule (schedule per stage, Section 1.4)
    const sweeper = fn('outbox-sweeper', 256, 30);
    props.events.grantSendMessages(sweeper);
    props.exportsQueue.grantSendMessages(sweeper);
    props.purge.grantSendMessages(sweeper);
    new events.Rule(this, 'OutboxSweep', {
      ruleName: n.sweepRule,
      schedule: events.Schedule.expression(cfg.sweepSchedule),
      targets: [new targets.LambdaFunction(sweeper, { retryAttempts: 2 })],
    });

    // company-purge: SQS purge -> delete one company's rows and S3 prefix
    const purge = fn('company-purge', 1024, 300);
    purge.addEventSource(new SqsEventSource(props.purge, { batchSize: 1, reportBatchItemFailures: true }));
    purge.addToRolePolicy(new iam.PolicyStatement({ actions: ['s3:ListBucket'], resources: [props.bucket.bucketArn] }));
    purge.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['s3:DeleteObject', 's3:DeleteObjectVersion'], resources: [`${props.bucket.bucketArn}/*`] }),
    );

    // Timers group: one-time approval schedules + weekly reminders (created by the app at runtime).
    new scheduler.CfnScheduleGroup(this, 'Timers', { name: n.schedulerGroup });

    new CfnOutput(this, 'EscalatorArn', { value: this.functions.escalator.functionArn, description: 'APP_SCHEDULER_TARGET_ARN' });
    new CfnOutput(this, 'SchedulerGroup', { value: n.schedulerGroup, description: 'APP_SCHEDULER_GROUP' });
  }
}
