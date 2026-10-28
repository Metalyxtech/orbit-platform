import { CfnOutput, Fn, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/types';
import { names } from './names';

export interface HostingStackProps extends StackProps {
  cfg: StageConfig;
  appRoleArn: string;
  eventsQueueUrl: string;
  escalatorArn: string;
  dlqArn: string;
  sesTopicArn?: string;
}

/**
 * The Amplify app itself is created once in the console (Section 1.1: it needs the info@ GitHub
 * login to authorise the Amplify GitHub App). This stack prints everything to paste into it.
 */
export class HostingStack extends Stack {
  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);
    const { cfg } = props;
    const n = names(cfg);

    new CfnOutput(this, 'ComputeRoleArn', {
      value: props.appRoleArn,
      description: 'Amplify > App settings > IAM roles > Compute role',
    });
    const vars = [
      `HOSTING=amplify`,
      `APP_STAGE=${cfg.stage}`,
      `APP_AWS_REGION=${cfg.region}`,
      `APP_BASE_URL=${cfg.appBaseUrl}`,
      `APP_S3_BUCKET=${n.bucket}`,
      `APP_SQS_EVENTS_URL=${props.eventsQueueUrl}`,
      `APP_SCHEDULER_GROUP=${n.schedulerGroup}`,
      `APP_SCHEDULER_TARGET_ARN=${props.escalatorArn}`,
      `APP_SCHEDULER_ROLE_ARN=arn:aws:iam::${this.account}:role/${n.schedulerInvokeRole}`,
      `APP_SCHEDULER_DLQ_ARN=${props.dlqArn}`,
      ...(props.sesTopicArn ? [`APP_SES_TOPIC_ARN=${props.sesTopicArn}`] : []),
    ];
    new CfnOutput(this, 'AmplifyEnvironmentVariables', {
      value: Fn.join(' ', vars),
      description: 'Amplify > Hosting > Environment variables (also add NEXT_PUBLIC_WORKOS_CLIENT_ID)',
    });
  }
}
