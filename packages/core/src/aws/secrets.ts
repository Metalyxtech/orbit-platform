import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { ssmClient } from './clients';

export type SecretName =
  | 'neonControlUrl'
  | 'neonTenantUrl'
  | 'workosApiKey'
  | 'workosCookiePassword'
  | 'timerHmacSecret'
  | 'sesWebhookTopicArn'
  | 'razorpayKeyId'
  | 'razorpayKeySecret'
  | 'razorpayWebhookSecret'
  // Accounting connections: each provider's app keys, and the key that encrypts companies' tokens.
  | 'accountingTokenKey'
  | 'zohoClientId'
  | 'zohoClientSecret'
  | 'quickbooksClientId'
  | 'quickbooksClientSecret'
  | 'xeroClientId'
  | 'xeroClientSecret';

const TTL_MS = 5 * 60 * 1000;
const ALL: SecretName[] = [
  'neonControlUrl',
  'neonTenantUrl',
  'workosApiKey',
  'workosCookiePassword',
  'timerHmacSecret',
  'razorpayKeyId',
  'razorpayKeySecret',
  'razorpayWebhookSecret',
  'accountingTokenKey',
  'zohoClientId',
  'zohoClientSecret',
  'quickbooksClientId',
  'quickbooksClientSecret',
  'xeroClientId',
  'xeroClientSecret',
];

let cache: { at: number; values: Partial<Record<SecretName, string>> } | undefined;
let inflight: Promise<Partial<Record<SecretName, string>>> | undefined;

const prefix = () => `/orbit/${process.env.APP_STAGE ?? 'dev'}/app/`;

/** Local development without AWS: APP_SECRETS_FROM_ENV=1 reads e.g. SECRET_NEON_TENANT_URL. */
function fromEnv(name: SecretName): string | undefined {
  const key = 'SECRET_' + name.replace(/([A-Z])/g, '_$1').toUpperCase();
  return process.env[key];
}

async function load(): Promise<Partial<Record<SecretName, string>>> {
  // SSM returns at most 10 parameters per call.
  const chunks: SecretName[][] = [];
  for (let i = 0; i < ALL.length; i += 10) chunks.push(ALL.slice(i, i + 10));
  const results = await Promise.all(chunks.map((names) => ssmClient().send(new GetParametersCommand({ Names: names.map((n) => prefix() + n), WithDecryption: true }))));
  const values: Partial<Record<SecretName, string>> = {};
  for (const res of results) {
    for (const p of res.Parameters ?? []) {
      values[p.Name!.slice(prefix().length) as SecretName] = p.Value;
    }
  }
  return values;
}

/** A secret that may not be set (optional features): undefined instead of an error. */
export async function findSecret(name: SecretName): Promise<string | undefined> {
  try {
    return (await getSecret(name)).trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Reads /orbit/<env>/app/* once (one SSM call) and caches for 5 minutes. */
export async function getSecret(name: SecretName): Promise<string> {
  if (process.env.APP_SECRETS_FROM_ENV === '1') {
    const v = fromEnv(name);
    if (!v) throw new Error(`Secret ${name} missing from environment`);
    return v;
  }
  if (!cache || Date.now() - cache.at > TTL_MS) {
    inflight ??= load().finally(() => (inflight = undefined));
    cache = { at: Date.now(), values: await inflight };
  }
  const value = cache.values[name];
  if (!value) throw new Error(`SSM parameter ${prefix()}${name} is missing`);
  return value;
}
