'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { href: string; label: string; badge?: number };

/** Sidebar links for the Management workspace; portals listed below them. */
export function ManageNav({ title, main, portals }: { title: string; main: Item[]; portals: Item[] }) {
  const path = usePathname();
  const active = (href: string) => (href === '/manage' ? path === href : path.startsWith(href));
  const link = (i: Item) => (
    <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined}>
      {i.label}
      {i.badge ? <span className="o-badge">{i.badge}</span> : null}
    </Link>
  );
  return (
    <>
      <div className="o-nav-title">{title}</div>
      <nav className="o-nav">{main.map(link)}</nav>
      <div className="o-nav-title">Portals</div>
      <nav className="o-nav">{portals.map(link)}</nav>
    </>
  );
}
