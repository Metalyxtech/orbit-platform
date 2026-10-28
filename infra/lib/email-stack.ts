import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/types';
import { names } from './names';

/** Section 7.1: SES domain identity (Easy DKIM, custom MAIL FROM), configuration set, feedback topic. */
export class EmailStack extends Stack {
  readonly configurationSet: ses.ConfigurationSet;
  readonly identityArn: string;

  constructor(scope: Construct, id: string, props: StackProps & { cfg: StageConfig }) {
    super(scope, id, props);
    const { cfg } = props;
    const n = names(cfg);

    const topic = new sns.Topic(this, 'SesFeedback', { topicName: n.sesTopic });
    if (cfg.appBaseUrl.startsWith('https://') && !cfg.appBaseUrl.includes('REPLACE_ME')) {
      // The webhook verifies the SNS signature and confirms the subscription itself.
      topic.addSubscription(new subs.UrlSubscription(`${cfg.appBaseUrl}/api/webhooks/ses`, { protocol: sns.SubscriptionProtocol.HTTPS }));
    }

    this.configurationSet = new ses.ConfigurationSet(this, 'Default', { configurationSetName: n.sesConfigSet });
    this.configurationSet.addEventDestination('Feedback', {
      destination: ses.EventDestination.snsTopic(topic),
      events: [ses.EmailSendingEvent.BOUNCE, ses.EmailSendingEvent.COMPLAINT, ses.EmailSendingEvent.DELIVERY],
    });

    if (cfg.mailDomain) {
      const identity = new ses.EmailIdentity(this, 'Domain', {
        identity: ses.Identity.domain(cfg.mailDomain),
        mailFromDomain: `bounce.${cfg.mailDomain}`,
        configurationSet: this.configurationSet,
      });
      this.identityArn = `arn:aws:ses:${cfg.region}:${this.account}:identity/${cfg.mailDomain}`;
      identity.dkimRecords.forEach((r, i) => {
        new CfnOutput(this, `DkimRecord${i + 1}`, { value: `CNAME ${r.name} -> ${r.value}` });
      });
      new CfnOutput(this, 'MailFromRecords', {
        value: `MX bounce.${cfg.mailDomain} -> 10 feedback-smtp.${cfg.region}.amazonses.com ; TXT bounce.${cfg.mailDomain} -> "v=spf1 include:amazonses.com ~all"`,
      });
      new CfnOutput(this, 'DmarcRecord', {
        value: `TXT _dmarc.${cfg.mailDomain} -> "v=DMARC1; p=quarantine; rua=mailto:dmarc@${cfg.mailDomain.split('.').slice(1).join('.')}"`,
      });
    } else {
      // Sandbox testing without a domain: verify single tester addresses in the SES console.
      this.identityArn = `arn:aws:ses:${cfg.region}:${this.account}:identity/*`;
    }
    new CfnOutput(this, 'SesTopicArn', { value: topic.topicArn, description: 'APP_SES_TOPIC_ARN' });
  }
}
