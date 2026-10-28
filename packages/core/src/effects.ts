import type { Db, TenantScope, Tx } from '@orbit/db';
import type { PlatformEvent } from './events';
import { enqueue, publishNow } from './outbox';
import { createTaskTimers, deleteTaskTimers } from './timers';

type TimerTask = Parameters<typeof createTaskTimers>[0];

/**
 * Side effects collected during a transaction and run after it commits:
 * outbox events (already written in the transaction) and EventBridge timers.
 */
export class Effects {
  readonly events: PlatformEvent[] = [];
  readonly timersToCreate: TimerTask[] = [];
  readonly timersToDelete: string[] = [];
  readonly after: (() => Promise<unknown>)[] = [];

  async emit(tx: Tx, event: PlatformEvent) {
    await enqueue(tx, event);
    this.events.push(event);
  }

  async flush(db: Db, scope: TenantScope) {
    await publishNow(db, scope, this.events);
    const timerJobs = [
      ...this.timersToDelete.map((id) => deleteTaskTimers(id)),
      ...this.timersToCreate.map((t) => createTaskTimers(t)),
      ...this.after.map((fn) => fn()),
    ];
    const results = await Promise.allSettled(timerJobs);
    for (const r of results) if (r.status === 'rejected') console.error('after-commit effect failed', r.reason);
  }
}
