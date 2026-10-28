import { Aws } from 'aws-cdk-lib';
import type { StageConfig } from '../config/types';

/**
 * Every resource name in one place (Section 4). Names are fixed so the app role's
 * policy can be written with plain ARNs and stacks never depend on each other in cycles.
 */
export function names(cfg: StageConfig) {
  const p = `orbit-${cfg.stage}`;
  const acct = Aws.ACCOUNT_ID;
  const region = cfg.region;
  return {
    prefix: p,
    paramPrefix: `/orbit/${cfg.stage}`,
    appRole: `${p}-app`,
    githubDeployRole: `${p}-github-deploy`,
    schedulerInvokeRole: `${p}-scheduler-invoke`,
    bucket: `${p}-files-apse1-${acct}`, // account id keeps the global S3 name unique
    eventsQueue: `${p}-events`,
    exportsQueue: `${p}-exports`,
    purgeQueue: `${p}-purge`,
    dlq: `${p}-events-dlq`,
    schedulerGroup: `${p}-timers`,
    sweepRule: `${p}-outbox-sweep`,
    sesConfigSet: `${p}-default`,
    sesTopic: `${p}-ses-feedback`,
    budget: `${p}-monthly`,
    fn: (name: string) => `${p}-${name}`,
    arn: {
      bucket: `arn:aws:s3:::${p}-files-apse1-${acct}`,
      queue: (name: string) => `arn:aws:sqs:${region}:${acct}:${name}`,
      scheduleGroup: `arn:aws:scheduler:${region}:${acct}:schedule/${p}-timers/*`,
      role: (name: string) => `arn:aws:iam::${acct}:role/${name}`,
      params: (path: string) => `arn:aws:ssm:${region}:${acct}:parameter/orbit/${cfg.stage}/${path}`,
      fn: (name: string) => `arn:aws:lambda:${region}:${acct}:function:${p}-${name}`,
    },
  };
}

export type Names = ReturnType<typeof names>;
