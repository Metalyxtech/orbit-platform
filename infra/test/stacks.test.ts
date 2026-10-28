import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { dev } from '../config/dev';
import { prod } from '../config/prod';
import { IdentityStack } from '../lib/identity-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { StorageStack } from '../lib/storage-stack';

const env = { account: '111111111111', region: 'ap-southeast-1' };

describe('IdentityStack', () => {
  const app = new App();
  const t = Template.fromStack(new IdentityStack(app, 'Id', { env, cfg: prod, enableVercel: false }));

  it('I1: creates no IAM users or access keys', () => {
    t.resourceCountIs('AWS::IAM::User', 0);
    t.resourceCountIs('AWS::IAM::AccessKey', 0);
  });

  it('app role is assumable by Amplify only (no Vercel unless enabled)', () => {
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'wepcm-prod-app',
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({ Principal: { Service: 'amplify.amazonaws.com' } })],
      },
    });
  });

  it('I2: prod deploy role only trusts the production GitHub environment', () => {
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'wepcm-prod-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: { 'token.actions.githubusercontent.com:sub': 'repo:metalyxtech/orbit-platform:environment:production' },
            }),
          }),
        ],
      },
    });
  });

  it('adds Vercel OIDC trust when enabled', () => {
    const t2 = Template.fromStack(new IdentityStack(new App(), 'Id2', { env, cfg: dev, enableVercel: true, vercelTeamSlug: 'acme' }));
    const roles = t2.findResources('AWS::IAM::Role', { Properties: { RoleName: 'wepcm-dev-app' } });
    expect(JSON.stringify(roles)).toContain('oidc.vercel.com/acme:sub');
  });
});

describe('StorageStack', () => {
  it('blocks public access, encrypts and versions', () => {
    const t = Template.fromStack(new StorageStack(new App(), 'S', { env, cfg: dev }));
    t.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'wepcm-dev-files-apse1',
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    });
  });
});

describe('MessagingStack', () => {
  it('redrives to the DLQ after 5 receives', () => {
    const t = Template.fromStack(new MessagingStack(new App(), 'M', { env, cfg: dev }));
    t.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'wepcm-dev-events',
      VisibilityTimeout: 60,
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
    });
    t.hasResourceProperties('AWS::SQS::Queue', { QueueName: 'wepcm-dev-events-dlq', MessageRetentionPeriod: 1209600 });
  });
});
