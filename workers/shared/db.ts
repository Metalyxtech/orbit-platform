import { eq } from 'drizzle-orm';
import { createHttpDb, processedEvents, type HttpDb } from '@orbit/db';
import { param } from './params';

let db: Promise<HttpDb> | undefined;

/** Neon serverless driver over HTTPS, as the `worker` role (works across companies). */
export function workerDb() {
  db ??= param('neonUrl').then(createHttpDb);
  return db;
}

/** Every handler is idempotent on event.id: skip ids already processed by this handler. */
export async function alreadyProcessed(id: string) {
  const d = await workerDb();
  const [row] = await d.select({ id: processedEvents.id }).from(processedEvents).where(eq(processedEvents.id, id));
  return !!row;
}

export async function markProcessed(id: string, handler: string) {
  const d = await workerDb();
  await d.insert(processedEvents).values({ id, handler }).onConflictDoNothing();
}
