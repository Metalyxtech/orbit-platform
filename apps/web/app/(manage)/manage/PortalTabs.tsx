import Link from 'next/link';

/** Tab bar for a portal inside the Management workspace. */
export function PortalTabs({ base, tabs, current }: { base: string; tabs: { id: string; label: string }[]; current: string }) {
  return (
    <nav className="o-tabs" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.id} href={`${base}/${t.id}`} aria-current={t.id === current ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
