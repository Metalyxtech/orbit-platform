import { notFound } from 'next/navigation';
import { query } from '@orbit/core/next';
import { navAllowed } from '@/portal-nav';
import { portalRolesFor } from '@/portal-role';
import { portalModules } from '@/portals';

export const dynamic = 'force-dynamic';

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ portal: string; path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { portal, path = [] } = await params;
  const mod = portalModules[portal];
  const key = path.join('/');
  const Screen = mod?.routes[key];
  if (!Screen) notFound();

  // Hide screens the role cannot use; the server functions check again.
  const item = mod.manifest.nav.find((n) => n.path === key);
  if (item) {
    const { ctx, role } = await query(async (tx, ctx) => ({ ctx, role: (await portalRolesFor(tx, ctx, [portal]))[portal] }));
    if (!navAllowed(item, ctx.role, role)) notFound();
  }

  return <Screen searchParams={await searchParams} />;
}
