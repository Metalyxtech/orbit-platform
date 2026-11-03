import type { SessionContext } from '@orbit/core';
import type { Workspace } from '@/management/types';
import { portalNavItems } from '@/portal-nav';
import { portalModules } from '@/portals';
import type { Group } from './ManageNav';

type Counts = { waiting: number; unread: number };

/**
 * Sidebar groups for the Management workspace:
 *   Management   - Overview, My approvals, Messages
 *   <Portal>     - its management view (charts), then the portal's own pages for this role
 *   Company admin - each portal's admin pages (company admins only)
 * People without the workspace get Messages and links into their portals.
 */
export function manageNavGroups(ctx: SessionContext, ws: Workspace, portals: string[], c: Counts): Group[] {
  const open = portals.filter((p) => portalModules[p]);
  const name = (p: string) => portalModules[p].manifest.name;
  if (!ws.roles.includes(ctx.role)) {
    return [
      { title: 'Workspace', items: [{ href: '/manage/messages', label: 'Messages', badge: c.unread }] },
      { title: 'Portals', items: open.map((p) => ({ href: `/${p}`, label: name(p) })) },
    ];
  }
  const groups: Group[] = [
    {
      title: ws.title,
      items: [
        { href: '/manage', label: 'Overview' },
        { href: '/manage/approvals', label: 'My approvals', badge: c.waiting },
        { href: '/manage/messages', label: 'Messages', badge: c.unread },
      ],
    },
  ];
  for (const p of open) {
    const items = portalNavItems(p, ctx, { approvals: c.waiting }).filter((n) => n.section === 'main');
    groups.push({
      title: name(p),
      items: [...(ws.modules[p] ? [{ href: `/manage/${p}`, label: 'Insights and charts' }] : []), ...items],
    });
  }
  if (ctx.role === 'company_admin') {
    for (const p of open) {
      const items = portalNavItems(p, ctx).filter((n) => n.section === 'admin');
      groups.push({ title: open.length > 1 ? `${name(p)} admin` : 'Company admin', items });
    }
  }
  return groups;
}
