import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/types';
import { names } from './names';

export interface OpsStackProps extends StackProps {
  cfg: StageConfig;
  dlq: sqs.IQueue;
  queues: sqs.IQueue[];
  functions: Record<string, lambda.IFunction>;
}

/** Section 7.4 alarms, AWS Budgets, and the non-secret SSM parameters. */
export class OpsStack extends Stack {
  constructor(scope: Construct, id: string, props: OpsStackProps) {
    super(scope, id, props);
    const { cfg } = props;
    const n = names(cfg);

    const topic = new sns.Topic(this, 'Alarms', { topicName: `${n.prefix}-alarms` });
    topic.addSubscription(new subs.EmailSubscription(cfg.alarmEmail));
    const notify = new actions.SnsAction(topic);
    const five = Duration.minutes(5);

    // dlq-not-empty
    new cloudwatch.Alarm(this, 'DlqNotEmpty', {
      alarmName: `${n.prefix}-dlq-not-empty`,
      metric: props.dlq.metricApproximateNumberOfMessagesVisible({ period: five, statistic: 'Maximum' }),
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(notify);

    // lambda-errors: > 3 in 5 min, any worker
    for (const [name, f] of Object.entries(props.functions)) {
      new cloudwatch.Alarm(this, `Errors-${name}`, {
        alarmName: `${n.prefix}-lambda-errors-${name}`,
        metric: f.metricErrors({ period: five, statistic: 'Sum' }),
        threshold: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(notify);
    }

    // queue-age: oldest message > 10 min
    props.queues.forEach((q, i) => {
      new cloudwatch.Alarm(this, `QueueAge${i}`, {
        alarmName: `${n.prefix}-queue-age-${i}`,
        metric: q.metricApproximateAgeOfOldestMessage({ period: five, statistic: 'Maximum' }),
        threshold: 600,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(notify);
    });

    // ses-bounce-rate > 4% (account reputation metric)
    new cloudwatch.Alarm(this, 'SesBounceRate', {
      alarmName: `${n.prefix}-ses-bounce-rate`,
      metric: new cloudwatch.Metric({ namespace: 'AWS/SES', metricName: 'Reputation.BounceRate', period: Duration.hours(1), statistic: 'Maximum' }),
      threshold: 0.04,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(notify);

    // budget: 50 / 80 / 100 % actual, 80 % forecast
    const subscriber = [{ subscriptionType: 'EMAIL', address: cfg.alarmEmail }];
    const notification = (threshold: number, type: 'ACTUAL' | 'FORECASTED') => ({
      notification: { comparisonOperator: 'GREATER_THAN', notificationType: type, threshold, thresholdType: 'PERCENTAGE' },
      subscribers: subscriber,
    });
    new budgets.CfnBudget(this, 'Budget', {
      budget: {
        budgetName: n.budget,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: cfg.budgetUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        notification(50, 'ACTUAL'),
        notification(80, 'ACTUAL'),
        notification(100, 'ACTUAL'),
        notification(80, 'FORECASTED'),
      ],
    });

    // Non-secret parameters. Secrets are SecureString and are created with scripts/put-secrets.sh.
    new ssm.StringParameter(this, 'SweepSchedule', {
      parameterName: `${n.paramPrefix}/outbox/sweepSchedule`,
      stringValue: cfg.sweepSchedule,
      description: 'Outbox sweeper schedule (UTC). Change it in infra/config and redeploy.',
    });

    new CfnOutput(this, 'AlarmTopic', { value: topic.topicArn });
  }
}
