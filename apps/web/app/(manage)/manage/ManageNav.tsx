'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type Item = { href: string; label: string; badge?: number };
export type Group = { title: string; items: Item[] };

/** Management workspace sidebar: titled groups of links (built in layout.tsx). */
export function ManageNav({ groups }: { groups: Group[] }) {
  const path = usePathname();
  // The longest matching link wins, so /timesheet/history does not also light up /timesheet.
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  const best = all.filter((h) => path === h || path.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  const link = (i: Item) => (
    <Link key={i.href} href={i.href} aria-current={i.href === best ? 'page' : undefined}>
      {i.label}
      {i.badge ? <span className="o-badge">{i.badge}</span> : null}
    </Link>
  );
  return (
    <>
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.title}>
            <div className="o-nav-title">{g.title}</div>
            <nav className="o-nav">{g.items.map(link)}</nav>
          </div>
        ))}
    </>
  );
}
