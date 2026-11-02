import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { isManager, workspaceFor } from '@/management/workspaces';
import { accessiblePortals } from '@/portal-access';
import { portalModules } from '@/portals';
import { PortalTabs } from '../../PortalTabs';

export const dynamic = 'force-dynamic';

/**
 * One portal inside the Management workspace: /manage/<portal>/<tab>. The tabs come from the
 * portal's management module (src/management/modules.ts), so this page never changes per portal.
 */
export default async function ManagePortal({
  params,
  searchParams,
}: {
  params: Promise<{ portal: string; tab?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ portal, tab }, sp] = await Promise.all([params, searchParams]);
  const s = await getSession();
  if (s.state !== 'ok') redirect('/');
  if (!isManager(s.ctx)) redirect('/manage/messages');
  const mod = workspaceFor(s.ctx).modules[portal];
  const portalMod = portalModules[portal];
  if (!mod || !portalMod || mod.tabs.length === 0) notFound();
  const open = await query((tx, ctx) => accessiblePortals(tx, ctx));
  if (!open.includes(portal)) redirect('/manage');

  const current = mod.tabs.find((t) => t.id === tab?.[0]);
  if (!current) redirect(`/manage/${portal}/${mod.tabs[0].id}`);
  const View = current.View;
  return (
    <>
      <header className="o-top">
        <strong>{portalMod.manifest.name}</strong>
      </header>
      <div className="o-page">
        <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <PortalTabs base={`/manage/${portal}`} tabs={mod.tabs.map((t) => ({ id: t.id, label: t.label }))} current={current.id} />
          {mod.links?.length ? (
            <div className="o-row" style={{ gap: 6 }}>
              {mod.links.map((l) => (
                <Link key={l.path} className="o-btn small" href={`/${portal}/${l.path}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <View params={sp} />
      </div>
    </>
  );
}
