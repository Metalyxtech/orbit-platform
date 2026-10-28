import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { and, inArray, isNull } from 'drizzle-orm';
import { outboxEvents, withTenant, type Db, type TenantScope, type Tx } from '@orbit/db';
import { sqsClient } from './aws/clients';
import type { PlatformEvent } from './events';

/** Writes the event in the caller's transaction. Nothing reaches SQS unless the transaction commits. */
export async function enqueue(tx: Tx, event: PlatformEvent) {
  await tx.insert(outboxEvents).values({
    id: event.id,
    companyId: event.companyId,
    type: event.type,
    payload: event,
  });
  return event.id;
}

/** Best effort send right after commit. Anything left unpublished is picked up by the outbox-sweeper Lambda. */
export async function publishNow(db: Db, scope: TenantScope, events: PlatformEvent[]) {
  const queueUrl = process.env.APP_SQS_EVENTS_URL;
  if (!queueUrl || events.length === 0) return;
  try {
    for (let i = 0; i < events.length; i += 10) {
      const batch = events.slice(i, i + 10);
      const res = await sqsClient().send(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: batch.map((e) => ({ Id: e.id, MessageBody: JSON.stringify(e) })),
        }),
      );
      const sent = (res.Successful ?? []).map((s) => s.Id!);
      if (sent.length) {
        await withTenant(db, scope, (tx) =>
          tx
            .update(outboxEvents)
            .set({ publishedAt: new Date() })
            .where(and(inArray(outboxEvents.id, sent), isNull(outboxEvents.publishedAt))),
        );
      }
    }
  } catch (err) {
    console.warn('outbox publishNow failed; sweeper will retry', err);
  }
}

