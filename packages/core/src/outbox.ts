import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { and, inArray, isNull } from 'drizzle-orm';
import { outboxEvents, withTenant, type Db, type Queryable, type TenantScope } from '@orbit/db';
import { sqsClient } from './aws/clients';
import type { PlatformEvent } from './events';

/** Writes the event in the caller's transaction. Nothing reaches SQS unless the transaction commits. */
export async function enqueue(tx: Queryable, event: PlatformEvent) {
  await tx.insert(outboxEvents).values({
    id: event.id,
    companyId: event.companyId,
    type: event.type,
    payload: event,
  });
  return event.id;
}

/**
 * Each SQS consumer has its own queue: a Lambda event filter deletes the messages it does not
 * match, so consumers must never share a queue. URLs are derived from APP_SQS_EVENTS_URL
 * (.../orbit-<env>-events -> -exports, -purge).
 */
export function queueUrlFor(type: string, eventsUrl: string) {
  if (type === 'report.export_requested') return eventsUrl.replace(/-events$/, '-exports');
  if (type === 'company.purge_requested') return eventsUrl.replace(/-events$/, '-purge');
  return eventsUrl;
}

/** Best effort send right after commit. Anything left unpublished is picked up by the outbox-sweeper Lambda. */
export async function publishNow(db: Db, scope: TenantScope, events: PlatformEvent[]) {
  const eventsUrl = process.env.APP_SQS_EVENTS_URL;
  if (!eventsUrl || events.length === 0) return;
  try {
    const byQueue = new Map<string, PlatformEvent[]>();
    for (const e of events) {
      const url = queueUrlFor(e.type, eventsUrl);
      byQueue.set(url, [...(byQueue.get(url) ?? []), e]);
    }
    for (const [queueUrl, list] of byQueue) {
      for (let i = 0; i < list.length; i += 10) {
        const batch = list.slice(i, i + 10);
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
    }
  } catch (err) {
    console.warn('outbox publishNow failed; sweeper will retry', err);
  }
}

