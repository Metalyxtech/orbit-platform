import type { StageConfig } from './types';

// Testing stage (Section 1.4). Edit the placeholders before the first deploy.
export const dev: StageConfig = {
  stage: 'dev',
  region: 'ap-southeast-1',
  githubOwner: 'Metalyxtech',
  githubRepo: 'orbit-platform',
  appBaseUrl: 'https://main.REPLACE_ME.amplifyapp.com',
  corsOrigins: ['https://*.amplifyapp.com', 'http://localhost:3000'],
  mailDomain: undefined, // e.g. 'mail.example.com' once you can add DNS records
  alarmEmail: 'info@example.com',
  budgetUsd: 5,
  logRetentionDays: 7,
  // 06:00-21:00 IST = 00:30-15:30 UTC, every 30 minutes
  sweepSchedule: 'cron(0/30 0-15 * * ? *)',
  createGithubOidcProvider: true,
};
