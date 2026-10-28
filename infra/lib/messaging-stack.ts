import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/types';
import { names } from './names';

/**
 * Section 4: SQS queues + DLQ. One queue per consumer Lambda (notifier, exporter, purge):
 * an SQS event-source filter deletes non-matching messages, so consumers must not share a queue.
 * Visibility timeout is at least the consumer's timeout (an AWS requirement).
 */
export class MessagingStack extends Stack {
  readonly events: sqs.Queue;
  readonly exports: sqs.Queue;
  readonly purge: sqs.Queue;
  readonly dlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: StackProps & { cfg: StageConfig }) {
    super(scope, id, props);
    const n = names(props.cfg);

    this.dlq = new sqs.Queue(this, 'EventsDlq', {
      queueName: n.dlq,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });
    const queue = (id: string, queueName: string, visibility: number) =>
      new sqs.Queue(this, id, {
        queueName,
        visibilityTimeout: Duration.seconds(visibility),
        retentionPeriod: Duration.days(4),
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        enforceSSL: true,
        deadLetterQueue: { queue: this.dlq, maxReceiveCount: 5 },
      });

    this.events = queue('Events', n.eventsQueue, 60);
    this.exports = queue('Exports', n.exportsQueue, 180);
    this.purge = queue('Purge', n.purgeQueue, 360);

    new CfnOutput(this, 'EventsQueueUrl', { value: this.events.queueUrl, description: 'APP_SQS_EVENTS_URL' });
    new CfnOutput(this, 'DlqArn', { value: this.dlq.queueArn, description: 'APP_SCHEDULER_DLQ_ARN' });
  }
}
