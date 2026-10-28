import { auditLog, type Tx } from '@orbit/db';

export async function audit(
  tx: Tx,
  entry: {
    companyId: string;
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string;
    data?: unknown;
    requestId?: string;
  },
) {
  await tx.insert(auditLog).values({ ...entry, data: entry.data ?? null });
}
