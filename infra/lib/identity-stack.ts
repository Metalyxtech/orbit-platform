import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/types';
import { names } from './names';

export interface IdentityStackProps extends StackProps {
  cfg: StageConfig;
  enableVercel: boolean;
  vercelTeamSlug?: string;
}

/**
 * Section 5 + 8: the app role (Amplify SSR compute role; Vercel OIDC optional), the scheduler
 * invoke role, and the GitHub OIDC deploy role. No IAM user access keys anywhere.
 */
export class IdentityStack extends Stack {
  readonly appRole: iam.Role;

  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);
    const { cfg } = props;
    const n = names(cfg);

    // ---------- App role: wepcm-<env>-app ----------
    const principals: iam.IPrincipal[] = [new iam.ServicePrincipal('amplify.amazonaws.com')];
    if (props.enableVercel) {
      if (!props.vercelTeamSlug) throw new Error('-c vercelTeamSlug=<team> is required with enableVercel=true');
      const slug = props.vercelTeamSlug;
      const vercel = new iam.OpenIdConnectProvider(this, 'VercelOidc', {
        url: `https://oidc.vercel.com/${slug}`,
        clientIds: [`https://vercel.com/${slug}`],
      });
      principals.push(
        new iam.WebIdentityPrincipal(vercel.openIdConnectProviderArn, {
          StringEquals: {
            [`oidc.vercel.com/${slug}:aud`]: `https://vercel.com/${slug}`,
            [`oidc.vercel.com/${slug}:sub`]: `owner:${slug}:project:orbit-platform:environment:production`,
          },
        }),
      );
    }

    this.appRole = new iam.Role(this, 'AppRole', {
      roleName: n.appRole,
      description: 'Next.js server code: Amplify SSR compute role (Vercel OIDC if hosting moves)',
      assumedBy: new iam.CompositePrincipal(...principals),
      maxSessionDuration: Duration.hours(1),
    });
    // Section 5.2, least privilege.
    this.appRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Files',
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: [`${n.arn.bucket}/*`],
      }),
    );
    this.appRole.addToPolicy(
      new iam.PolicyStatement({ sid: 'FilesList', actions: ['s3:ListBucket'], resources: [n.arn.bucket] }),
    );
    this.appRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Events',
        actions: ['sqs:SendMessage'],
        resources: [n.eventsQueue, n.exportsQueue, n.purgeQueue].map(n.arn.queue),
      }),
    );
    this.appRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Timers',
        actions: ['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule'],
        resources: [n.arn.scheduleGroup],
      }),
    );
    this.appRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PassSchedulerRole',
        actions: ['iam:PassRole'],
        resources: [n.arn.role(n.schedulerInvokeRole)],
      }),
    );
    this.appRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Secrets',
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [n.arn.params('app/*')],
      }),
    );
    // Amplify writes SSR logs with the compute role.
    this.appRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Logs',
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`arn:aws:logs:${cfg.region}:${this.account}:log-group:/aws/amplify/*`],
      }),
    );

    // ---------- Scheduler invoke role ----------
    const schedulerRole = new iam.Role(this, 'SchedulerInvokeRole', {
      roleName: n.schedulerInvokeRole,
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': this.account } },
      }),
    });
    schedulerRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [n.arn.fn('escalator')] }),
    );
    schedulerRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['sqs:SendMessage'], resources: [n.arn.queue(n.dlq)] }),
    );

    // ---------- GitHub OIDC deploy role ----------
    const providerArn = cfg.createGithubOidcProvider
      ? new iam.OpenIdConnectProvider(this, 'GithubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        }).openIdConnectProviderArn
      : `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;

    const repo = `repo:${cfg.githubOwner}/${cfg.githubRepo}`;
    // dev: pushes to main. prod: only jobs in the "production" GitHub environment (manual approval).
    const sub = cfg.stage === 'prod' ? `${repo}:environment:production` : `${repo}:ref:refs/heads/main`;
    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: n.githubDeployRole,
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: { 'token.actions.githubusercontent.com:sub': sub },
      }),
      maxSessionDuration: Duration.hours(1),
    });
    // CDK deploys through the bootstrap roles; nothing else.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadDbUrlForMigrations',
        actions: ['ssm:GetParameter'],
        resources: [n.arn.params('ci/*')],
      }),
    );

    new CfnOutput(this, 'AppRoleArn', { value: this.appRole.roleArn, description: 'Amplify > App settings > IAM roles > Compute role' });
    new CfnOutput(this, 'SchedulerRoleArn', { value: schedulerRole.roleArn, description: 'APP_SCHEDULER_ROLE_ARN' });
    new CfnOutput(this, 'GithubDeployRoleArn', { value: deployRole.roleArn, description: `GitHub secret AWS_DEPLOY_ROLE_${cfg.stage.toUpperCase()}` });
  }
}
