import { App, Tags } from 'aws-cdk-lib';
import { dev } from '../config/dev';
import { prod } from '../config/prod';
import { EmailStack } from '../lib/email-stack';
import { HostingStack } from '../lib/hosting-stack';
import { IdentityStack } from '../lib/identity-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { OpsStack } from '../lib/ops-stack';
import { StorageStack } from '../lib/storage-stack';
import { WorkersStack } from '../lib/workers-stack';

// cdk deploy --all -c stage=dev|prod [-c enableVercel=true -c vercelTeamSlug=<team>]
const app = new App();
const stage = app.node.tryGetContext('stage') ?? 'dev';
const cfg = { dev, prod }[stage as 'dev' | 'prod'];
if (!cfg) throw new Error(`Unknown stage "${stage}". Use -c stage=dev or -c stage=prod`);

const env = { account: cfg.account ?? process.env.CDK_DEFAULT_ACCOUNT, region: cfg.region };
const p = `Wepcm${stage[0].toUpperCase()}${stage.slice(1)}`;

const identity = new IdentityStack(app, `${p}Identity`, {
  env,
  cfg,
  enableVercel: app.node.tryGetContext('enableVercel') === 'true',
  vercelTeamSlug: app.node.tryGetContext('vercelTeamSlug'),
});
const storage = new StorageStack(app, `${p}Storage`, { env, cfg });
const messaging = new MessagingStack(app, `${p}Messaging`, { env, cfg });
const email = new EmailStack(app, `${p}Email`, { env, cfg });
const workers = new WorkersStack(app, `${p}Workers`, {
  env,
  cfg,
  bucket: storage.bucket,
  events: messaging.events,
  exportsQueue: messaging.exports,
  purge: messaging.purge,
  sesIdentityArn: email.identityArn,
  sesConfigurationSet: email.configurationSet.configurationSetName,
});
new OpsStack(app, `${p}Ops`, {
  env,
  cfg,
  dlq: messaging.dlq,
  queues: [messaging.events, messaging.exports, messaging.purge],
  functions: workers.functions,
});
new HostingStack(app, `${p}Hosting`, {
  env,
  cfg,
  appRoleArn: identity.appRole.roleArn,
  eventsQueueUrl: messaging.events.queueUrl,
  escalatorArn: workers.functions.escalator.functionArn,
  dlqArn: messaging.dlq.queueArn,
});

Tags.of(app).add('project', 'orbit-platform');
Tags.of(app).add('stage', stage);
