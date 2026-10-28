import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { ssmClient } from './clients';

export type SecretName =
  | 'neonControlUrl'
  | 'neonTenantUrl'
  | 'workosApiKey'
  | 'workosCookiePassword'
  | 'timerHmacSecret'
  | 'sesWebhookTopicArn';

const TTL_MS = 5 * 60 * 1000;
const ALL: SecretName[] = [
  'neonControlUrl',
  'neonTenantUrl',
  'workosApiKey',
  'workosCookiePassword',
  'timerHmacSecret',
];

let cache: { at: number; values: Partial<Record<SecretName, string>> } | undefined;
let inflight: Promise<Partial<Record<SecretName, string>>> | undefined;

const prefix = () => `/wepcm/${process.env.APP_STAGE ?? 'dev'}/app/`;

/** Local development without AWS: APP_SECRETS_FROM_ENV=1 reads e.g. SECRET_NEON_TENANT_URL. */
function fromEnv(name: SecretName): string | undefined {
  const key = 'SECRET_' + name.replace(/([A-Z])/g, '_$1').toUpperCase();
  return process.env[key];
}

async function load(): Promise<Partial<Record<SecretName, string>>> {
  const res = await ssmClient().send(
    new GetParametersCommand({ Names: ALL.map((n) => prefix() + n), WithDecryption: true }),
  );
  const values: Partial<Record<SecretName, string>> = {};
  for (const p of res.Parameters ?? []) {
    values[p.Name!.slice(prefix().length) as SecretName] = p.Value;
  }
  return values;
}

/** Reads /wepcm/<env>/app/* once (one SSM call) and caches for 5 minutes. */
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
