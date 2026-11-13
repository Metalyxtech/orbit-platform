import type { StageConfig } from './types';

// Pilot / live stage. Every 5 min 06:00-22:00 IST for pilot; use 'rate(2 minutes)' for live.
export const prod: StageConfig = {
  stage: 'prod',
  region: 'ap-southeast-1',
  githubOwner: 'Metalyxtech',
  githubRepo: 'orbit-platform',
  appBaseUrl: 'https://app.example.com',
  corsOrigins: ['https://app.example.com'],
  mailDomain: 'mail.example.com',
  alarmEmail: 'info@example.com',
  budgetUsd: 40,
  logRetentionDays: 14,
  sweepSchedule: 'cron(0/5 0-16 * * ? *)',
  createGithubOidcProvider: true,
};
