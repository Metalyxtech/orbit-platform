'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isMenu, type MenuLink, type MenuSection } from './menu';

const KEY = 'orbit-menu-open';

/**
 * Sidebar menu: short main menu, related pages inside drop-downs. The drop-down holding the page
 * you are on opens by itself; others open on click and are remembered on this device.
 */
export function SideMenu({ sections }: { sections: MenuSection[] }) {
  const path = usePathname();
  const hrefs = sections.flatMap((s) => s.entries.flatMap((e) => (isMenu(e) ? e.items.map((i) => i.href) : [e.href])));
  // The longest matching link wins, so /timesheet/history does not also light up /timesheet.
  const active = hrefs.filter((h) => path === h || path.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    try {
      setOpen(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    } catch {
      /* private mode */
    }
  }, []);
  const toggle = (id: string) => {
    const next = open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
    setOpen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const link = (l: MenuLink, sub = false) => (
    <Link key={l.href} href={l.href} className={sub ? 'o-menu-sub' : undefined} aria-current={l.href === active ? 'page' : undefined}>
      <span>{l.label}</span>
      {l.badge ? <span className="o-badge">{l.badge}</span> : null}
    </Link>
  );
  return (
    <div className="o-side-scroll">
      {sections
        .filter((s) => s.entries.length)
        .map((s, si) => (
          <div key={s.title ?? si} className="o-menu-section">
            {s.title && <div className="o-nav-title">{s.title}</div>}
            <nav className="o-nav">
              {s.entries.map((e) => {
                if (!isMenu(e)) return link(e);
                const id = `${s.title ?? ''}/${e.label}`;
                const here = e.items.some((i) => i.href === active);
                const on = here || open.includes(id);
                const badge = e.items.reduce((t, i) => t + (i.badge ?? 0), 0);
                return (
                  <div key={id} className={`o-menu${on ? ' open' : ''}${here ? ' here' : ''}`}>
                    <button type="button" className="o-menu-head" aria-expanded={on} onClick={() => !here && toggle(id)}>
                      <span>{e.label}</span>
                      {!on && badge > 0 && <span className="o-badge">{badge}</span>}
                      <i aria-hidden>▾</i>
                    </button>
                    <div className="o-menu-items">{e.items.map((i) => link(i, true))}</div>
                  </div>
                );
              })}
            </nav>
          </div>
        ))}
    </div>
  );
}
