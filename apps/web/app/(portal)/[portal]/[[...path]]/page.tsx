import { notFound } from 'next/navigation';
import { requireSession } from '@orbit/core/next';
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
  const ctx = await requireSession();
  const item = mod.manifest.nav.find((n) => n.path === key);
  if (item?.roles && ctx.role !== 'company_admin' && !item.roles.includes(ctx.role)) notFound();

  return <Screen searchParams={await searchParams} />;
}
