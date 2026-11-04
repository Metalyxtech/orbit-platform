'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export type Item = { href: string; label: string; badge?: number };
export type Group = { title: string; items: Item[] };

const KEY = 'orbit-nav-open';

/**
 * Management workspace sidebar: titled groups of links (built in nav-groups.ts). The first group
 * and the group of the page you are on stay open; the others fold so the menu stays short.
 */
export function ManageNav({ groups }: { groups: Group[] }) {
  const path = usePathname();
  const shown = groups.filter((g) => g.items.length);
  // The longest matching link wins, so /timesheet/history does not also light up /timesheet.
  const all = shown.flatMap((g) => g.items.map((i) => i.href));
  const best = all.filter((h) => path === h || path.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  const current = shown.find((g) => g.items.some((i) => i.href === best))?.title;
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    try {
      setOpen(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    } catch {
      /* private mode: defaults only */
    }
  }, []);
  const isOpen = (title: string, i: number) => i === 0 || title === current || open.includes(title);
  const toggle = (title: string) => {
    const next = open.includes(title) ? open.filter((t) => t !== title) : [...open, title];
    setOpen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const link = (i: Item) => (
    <Link key={i.href} href={i.href} aria-current={i.href === best ? 'page' : undefined}>
      {i.label}
      {i.badge ? <span className="o-badge">{i.badge}</span> : null}
    </Link>
  );
  return (
    <div className="o-side-scroll">
      {shown.map((g, idx) => {
        const on = isOpen(g.title, idx);
        const badge = g.items.reduce((t, i) => t + (i.badge ?? 0), 0);
        return (
          <div key={g.title} className={`o-nav-group${on ? '' : ' closed'}`}>
            {idx === 0 ? (
              <div className="o-nav-title">{g.title}</div>
            ) : (
              <button type="button" className="o-nav-toggle" aria-expanded={on} onClick={() => g.title !== current && toggle(g.title)}>
                <span>{g.title}</span>
                {!on && badge > 0 && <span className="o-badge">{badge}</span>}
                <i aria-hidden>{on ? '−' : '+'}</i>
              </button>
            )}
            <nav className="o-nav">{g.items.map(link)}</nav>
          </div>
        );
      })}
    </div>
  );
}
