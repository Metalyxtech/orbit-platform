'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, isIconName, menuIcon } from './Icon';
import { isMenu, type MenuEntry, type MenuLink, type MenuSection } from './menu';

const KEY = 'orbit-menu-open';
/** Menus with at least this many pages get the "Find a page" box. */
const SEARCH_FROM = 10;

const iconOf = (e: MenuEntry) => (isIconName(e.icon) ? e.icon : menuIcon(e.label));

/**
 * Sidebar menu: short main menu, related pages inside drop-downs. The drop-down holding the page
 * you are on opens by itself; others open on click and are remembered on this device.
 * Long menus (company admins) also get a box to find a page by name; "/" jumps to it.
 */
export function SideMenu({ sections }: { sections: MenuSection[] }) {
  const path = usePathname();
  const router = useRouter();
  const box = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  // Every page with where it sits, for the active state and for searching.
  const all = useMemo(
    () =>
      sections.flatMap((s) =>
        s.entries.flatMap((e) =>
          isMenu(e)
            ? e.items.map((i) => ({ ...i, where: [s.title, e.label].filter(Boolean).join(' · '), text: `${i.label} ${e.label}`.toLowerCase(), icon: iconOf(e) }))
            : [{ ...e, where: s.title ?? '', text: e.label.toLowerCase(), icon: iconOf(e) }],
        ),
      ),
    [sections],
  );
  // The longest matching link wins, so /timesheet/history does not also light up /timesheet.
  const active = all
    .map((l) => l.href)
    .filter((h) => path === h || path.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    try {
      setOpen(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    } catch {
      /* private mode */
    }
  }, []);
  useEffect(() => setQ(''), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (!box.current) return;
      e.preventDefault();
      box.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      {!sub && <Icon name={iconOf(l)} />}
      <span>{l.label}</span>
      {l.badge ? <span className="o-badge">{l.badge}</span> : null}
    </Link>
  );

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Matches on the page name or its drop-down; pages whose own name matches come first.
  const found = words.length
    ? all
        .filter((l) => words.every((w) => l.text.includes(w)))
        .sort((a, b) => Number(words.every((w) => b.label.toLowerCase().includes(w))) - Number(words.every((w) => a.label.toLowerCase().includes(w))))
    : [];

  return (
    <div className="o-side-scroll">
      {all.length >= SEARCH_FROM && (
        <div className="o-menu-find">
          <Icon name="search" />
          <input
            ref={box}
            type="search"
            value={q}
            placeholder="Find a page"
            aria-label="Find a page in the menu"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQ('');
                e.currentTarget.blur();
              }
              if (e.key === 'Enter' && found[0]) router.push(found[0].href);
            }}
          />
          {!q && <kbd aria-hidden>/</kbd>}
        </div>
      )}
      {words.length > 0 ? (
        <nav className="o-nav o-menu-found" aria-label="Pages found">
          {found.map((l) => (
            <Link key={l.href} href={l.href} aria-current={l.href === active ? 'page' : undefined}>
              <Icon name={l.icon} />
              <span>
                {l.label}
                {l.where && <small>{l.where}</small>}
              </span>
              {l.badge ? <span className="o-badge">{l.badge}</span> : null}
            </Link>
          ))}
          {found.length === 0 && <p className="o-menu-none">No page matches "{q.trim()}".</p>}
        </nav>
      ) : (
        sections
          .filter((s) => s.entries.length)
          .map((s, si) => (
            <div key={s.title ?? si} className="o-menu-section">
              {s.title && <div className="o-nav-title">{s.title}</div>}
              <nav className="o-nav" aria-label={s.title ?? 'Main menu'}>
                {s.entries.map((e) => {
                  if (!isMenu(e)) return link(e);
                  const id = `${s.title ?? ''}/${e.label}`;
                  const here = e.items.some((i) => i.href === active);
                  const on = here || open.includes(id);
                  const badge = e.items.reduce((t, i) => t + (i.badge ?? 0), 0);
                  return (
                    <div key={id} className={`o-menu${on ? ' open' : ''}${here ? ' here' : ''}`}>
                      <button type="button" className="o-menu-head" aria-expanded={on} onClick={() => !here && toggle(id)}>
                        <Icon name={iconOf(e)} />
                        <span>{e.label}</span>
                        {!on && badge > 0 && <span className="o-badge">{badge}</span>}
                        <i aria-hidden>
                          <Icon name="down" size={14} />
                        </i>
                      </button>
                      <div className="o-menu-items">{e.items.map((i) => link(i, true))}</div>
                    </div>
                  );
                })}
              </nav>
            </div>
          ))
      )}
    </div>
  );
}
