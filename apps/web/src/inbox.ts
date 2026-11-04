import type { SessionContext } from '@orbit/core';
import type { Tx } from '@orbit/db';
import { listMessages } from './messages';
import { accessiblePortals } from './portal-access';
import { portalModules, type InboxItem } from './portals';

/**
 * Everything waiting for this person, across every portal they can open, plus unread messages.
 * Items are worked out from live data, so a task disappears as soon as it is done.
 */
export async function inboxItems(tx: Tx, ctx: SessionContext): Promise<InboxItem[]> {
  const out: InboxItem[] = [];
  for (const p of await accessiblePortals(tx, ctx)) {
    const fn = portalModules[p]?.inboxItems;
    if (!fn) continue;
    try {
      out.push(...(await tx.transaction((sp) => fn(sp, ctx))));
    } catch {
      /* a portal that is not ready yet (missing migration) shows nothing */
    }
  }
  const inbox = await listMessages(tx, ctx, 'inbox');
  for (const m of inbox.data.filter((x) => !x.readAt).slice(0, 10)) {
    out.push({ id: `msg:${m.id}`, portal: 'Messages', title: `${m.kind === 'review' ? 'Review' : 'Message'} from ${m.otherName}`, detail: m.subject, href: '/manage/messages' });
  }
  return out.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
}
