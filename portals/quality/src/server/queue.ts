import { and, eq, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { qcInspections, type Tx } from '@orbit/db';
import { SOURCE_KIND, type QcRole, type QcSource } from '../config';
import { qualityTeam } from './admin';
import { myRole, notReady } from './shared';

export interface QueueItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
}

async function build(tx: Tx, ctx: SessionContext): Promise<QueueItem[]> {
  const me = await myRole(tx, ctx);
  // A quality admin gets only the inspections of the roles they cover (Quality settings).
  const covers: QcRole[] = me === 'admin' ? ((await qualityTeam(tx, ctx)).find((p) => p.membershipId === ctx.membershipId)?.covers ?? []) : [me];
  const steps = [...(covers.includes('inspector') ? ['pending'] : []), ...(covers.includes('manager') ? ['submitted'] : [])];
  if (!steps.length) return [];
  const rows = await tx.select().from(qcInspections).where(and(eq(qcInspections.companyId, ctx.companyId), inArray(qcInspections.status, steps)));
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => {
      const hours = Math.round((Date.now() - r.createdAt.getTime()) / 36e5);
      const what = SOURCE_KIND[r.source as QcSource].toLowerCase();
      return r.status === 'pending'
        ? { id: `qi:${r.id}`, title: `${r.returnNote ? 'Re-check' : 'Inspect'} ${r.sourceRef}: ${r.title}`, detail: r.returnNote ? `QC manager: ${r.returnNote}` : `${r.number} · ${what}${r.party ? ` · ${r.party}` : ''}${r.round > 1 ? ` · round ${r.round}` : ''}`, href: `/quality/inspection?id=${r.id}`, urgent: !!r.returnNote || hours > 24 }
        : { id: `qa:${r.id}`, title: `Final approval ${r.number}: ${r.result === 'pass' ? 'PASS' : 'FAIL'}`, detail: `${r.sourceRef} · ${r.title}`, href: `/quality/inspection?id=${r.id}`, urgent: r.result === 'fail' };
    });
}

export async function myQueue(tx: Tx, ctx: SessionContext): Promise<QueueItem[]> {
  try {
    return await tx.transaction((sp) => build(sp, ctx));
  } catch (err) {
    if (notReady(err)) return [];
    throw err;
  }
}
export const countMyQueue = async (tx: Tx, ctx: SessionContext) => (await myQueue(tx, ctx)).length;
