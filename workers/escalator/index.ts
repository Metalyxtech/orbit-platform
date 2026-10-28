import { signBody } from '@orbit/core/hmac';
import type { TimerPayload } from '@orbit/core';
import { log } from '../shared/log';
import { param } from '../shared/params';

/**
 * Invoked by EventBridge Scheduler (approval reminder, SLA, weekly reminder).
 * Forwards the payload to the app, HMAC signed. A non-2xx makes Scheduler retry, then DLQ.
 */
export async function handler(payload: TimerPayload) {
  const body = JSON.stringify(payload);
  const secret = await param('timerHmacSecret');
  const res = await fetch(`${process.env.APP_BASE_URL}/api/internal/timer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-orbit-signature': signBody(secret, body) },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  log(res.ok ? 'info' : 'error', 'timer delivered', { kind: payload.kind, status: res.status, body: text.slice(0, 500) });
  if (!res.ok) throw new Error(`App returned ${res.status}`);
  return { status: res.status };
}
