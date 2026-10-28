export interface StageConfig {
  stage: 'dev' | 'prod';
  /** AWS account id of wepcm-dev / wepcm-prod. Falls back to the CLI's account. */
  account?: string;
  region: 'ap-southeast-1';
  /** GitHub owner of orbit-platform (the company info@ account or organisation). */
  githubOwner: string;
  githubRepo: string;
  /** Public URL of the app on this stage, e.g. https://test.example.com. */
  appBaseUrl: string;
  /** Browser origins allowed to PUT to S3 with pre-signed URLs. */
  corsOrigins: string[];
  /** SES sending domain (Section 7.1). Leave empty to skip SES until DNS is ready. */
  mailDomain?: string;
  alarmEmail: string;
  budgetUsd: number;
  logRetentionDays: 7 | 14 | 30;
  /** EventBridge rule expression (UTC). Section 1.4: testing every 30 min 06:00 to 21:00 IST. */
  sweepSchedule: string;
  /** Create the GitHub OIDC provider (only once per account). */
  createGithubOidcProvider: boolean;
}
