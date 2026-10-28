import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
let cache: Promise<Record<string, string>> | undefined;

/**
 * Reads /orbit/<stage>/workers/* once per cold start:
 * neonUrl, timerHmacSecret, fromAddress, replyTo, sandboxAllowlist.
 */
export function workerParams(): Promise<Record<string, string>> {
  // Local runs and tests: WORKER_PARAMS='{"neonUrl":"postgres://..."}'
  if (process.env.WORKER_PARAMS) return Promise.resolve(JSON.parse(process.env.WORKER_PARAMS));
  cache ??= (async () => {
    const prefix = `${process.env.PARAM_PREFIX}/workers/`;
    const out: Record<string, string> = {};
    let next: string | undefined;
    do {
      const res = await ssm.send(new GetParametersByPathCommand({ Path: prefix, WithDecryption: true, NextToken: next }));
      for (const p of res.Parameters ?? []) out[p.Name!.slice(prefix.length)] = p.Value!;
      next = res.NextToken;
    } while (next);
    return out;
  })().catch((err) => {
    cache = undefined;
    throw err;
  });
  return cache;
}

export async function param(name: string) {
  const v = (await workerParams())[name];
  if (!v) throw new Error(`SSM parameter ${process.env.PARAM_PREFIX}/workers/${name} is missing`);
  return v;
}
