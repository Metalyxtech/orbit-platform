import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';

// The hosting switch (Section 5.3). This is the ONLY place that knows which host we run on.
// Amplify: the SSR compute role is found by the default Node provider chain.
// Vercel:  the same IAM role is assumed through Vercel OIDC.
export const region = process.env.APP_AWS_REGION ?? 'ap-southeast-1';

export const credentials =
  process.env.HOSTING === 'vercel'
    ? awsCredentialsProvider({ roleArn: process.env.APP_ROLE_ARN! })
    : fromNodeProviderChain();
