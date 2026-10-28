import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSecret } from '@orbit/core/aws';
import { verifySignature } from '@orbit/core/hmac';
import { runAsSystem } from '@orbit/core/next';
import { handleTimer } from '@orbit/portal-timesheet/server';

export const dynamic = 'force-dynamic';

const payloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remind'), taskId: z.uuid(), companyId: z.uuid() }),
  z.object({ kind: z.literal('sla'), taskId: z.uuid(), companyId: z.uuid() }),
  z.object({ kind: z.literal('ts_deadline_reminder'), companyId: z.uuid() }),
]);

/** Called by the escalator Lambda (EventBridge Scheduler). HMAC signed with /wepcm/<env>/app/timerHmacSecret. */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const secret = await getSecret('timerHmacSecret');
  if (!verifySignature(secret, body, req.headers.get('x-orbit-signature'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  const parsed = payloadSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const result = await runAsSystem(parsed.data.companyId, requestId, (tx, ctx) => handleTimer(tx, ctx, parsed.data));
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error(JSON.stringify({ requestId, error: String(err) }));
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
