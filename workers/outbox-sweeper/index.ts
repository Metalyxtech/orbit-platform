import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs';
import { and, asc, inArray, isNull, lt, sql } from 'drizzle-orm';
import { queueUrlFor } from '@orbit/core/outbox';
import type { PlatformEvent } from '@orbit/core/events';
import { outboxEvents } from '@orbit/db';
import { workerDb } from '../shared/db';
import { log } from '../shared/log';

const sqs = new SQSClient({});

/**
 * Finds outbox_events unpublished for over 2 minutes and sends them to SQS.
 * Consumers are idempotent on event.id, so a duplicate send is harmless.
 */
export async function handler() {
  const db = await workerDb();
  const pending = await db
    .select()
    .from(outboxEvents)
    .where(and(isNull(outboxEvents.publishedAt), lt(outboxEvents.createdAt, sql`now() - interval '2 minutes'`)))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(200);
  if (pending.length === 0) return { sent: 0 };

  const eventsUrl = process.env.EVENTS_QUEUE_URL!;
  const byQueue = new Map<string, typeof pending>();
  for (const e of pending) {
    const url = queueUrlFor(e.type, eventsUrl);
    byQueue.set(url, [...(byQueue.get(url) ?? []), e]);
  }

  let sent = 0;
  for (const [QueueUrl, rows] of byQueue) {
    for (let i = 0; i < rows.length; i += 10) {
      const batch = rows.slice(i, i + 10);
      const res = await sqs.send(
        new SendMessageBatchCommand({
          QueueUrl,
          Entries: batch.map((e) => ({ Id: e.id, MessageBody: JSON.stringify(e.payload as PlatformEvent) })),
        }),
      );
      const ok = (res.Successful ?? []).map((s) => s.Id!);
      if (ok.length) {
        await db.update(outboxEvents).set({ publishedAt: new Date() }).where(inArray(outboxEvents.id, ok));
      }
      const failed = (res.Failed ?? []).map((f) => f.Id!);
      if (failed.length) {
        await db
          .update(outboxEvents)
          .set({ attempts: sql`${outboxEvents.attempts} + 1` })
          .where(inArray(outboxEvents.id, failed));
      }
      sent += ok.length;
    }
  }
  log('info', 'outbox swept', { found: pending.length, sent });
  return { sent };
}
