import type { SessionContext } from '@orbit/core';
import type { Workspace } from '@/management/types';
import { companyAdminItems } from '@/company-admin-nav';
import { portalNavItems } from '@/portal-nav';
import { portalModules } from '@/portals';
import { PROJECT_DOCS_HREF } from '@/project-docs';
import { adminSections, type MenuSection } from '@orbit/ui';

type Counts = { waiting: number; unread: number; badges: Record<string, number>; roles: Record<string, string | null>; projectDocs?: boolean; held?: number };

/**
 * Sidebar for the Management workspace, as a short main menu with drop-downs:
 *   Overview, My approvals, Messages
 *   Portals: one drop-down per portal (its charts, then its pages for this role)
 *   Company admin: People and portals, Company portals, then '<Portal> settings' drop-downs
 * People without the workspace get Messages and links into their portals.
 */
export function manageNavSections(ctx: SessionContext, ws: Workspace, portals: string[], c: Counts): MenuSection[] {
  const open = portals.filter((p) => portalModules[p]);
  const name = (p: string) => portalModules[p].manifest.name;
  if (!ws.roles.includes(ctx.role)) {
    return [
      { entries: [{ href: '/manage/messages', label: 'Messages', badge: c.unread }, ...(c.projectDocs ? [{ href: PROJECT_DOCS_HREF, label: 'Project documents' }] : [])] },
      { title: 'Portals', entries: open.map((p) => ({ href: `/${p}`, label: name(p) })) },
    ];
  }
  const sections: MenuSection[] = [
    {
      entries: [
        { href: '/manage', label: 'Overview' },
        { href: '/manage/approvals', label: 'My approvals', badge: c.waiting },
        // GM and company admins: everything on hold and the latest comments, across portals.
        ...(ctx.role === 'management' || ctx.role === 'company_admin'
          ? [
              { href: '/manage/control', label: 'Process control', badge: c.held },
              { href: '/manage/teams', label: 'Project teams' },
            ]
          : []),
        { href: '/manage/messages', label: 'Messages', badge: c.unread },
        ...(c.projectDocs ? [{ href: PROJECT_DOCS_HREF, label: 'Project documents' }] : []),
        // Management sees the change history here; company admins find it under Company admin.
        ...(ctx.role === 'management' ? [{ href: '/manage/company/history', label: 'Change history' }] : []),
      ],
    },
    {
      title: 'Portals',
      entries: open.map((p) => ({
        label: name(p),
        items: [
          ...(ws.modules[p] ? [{ href: `/manage/${p}`, label: 'Insights and charts' }] : []),
          ...portalNavItems(p, ctx, { approvals: c.badges[p] }, c.roles[p])
            .filter((n) => n.section === 'main')
            .map((n) => ({ href: n.href, label: n.label, badge: n.badge })),
        ],
      })),
    },
  ];
  const admin = companyAdminItems(ctx, open, c.roles);
  sections.push(...adminSections(admin));
  return sections;
}
