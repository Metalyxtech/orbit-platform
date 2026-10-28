'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export interface ShellNavItem {
  href: string;
  label: string;
  section: 'main' | 'admin';
  badge?: number;
}

export interface AppShellProps {
  brand: string;
  companyName: string;
  portalName: string;
  portals: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  nav: ShellNavItem[];
  user: { name: string; title: string | null };
  onSwitchCompany?: (companyId: string) => Promise<void>;
  signOutHref: string;
  children: ReactNode;
}

/** Sidebar (graphite) + top bar + portal switcher. */
export function AppShell(props: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) =>
    pathname === href || (href.split('/').length > 2 && pathname.startsWith(href + '/'));
  const main = props.nav.filter((n) => n.section === 'main');
  const admin = props.nav.filter((n) => n.section === 'admin');

  const link = (n: ShellNavItem) => (
    <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>
      {n.label}
      {n.badge ? <span className="o-badge">{n.badge}</span> : null}
    </Link>
  );

  return (
    <div className="o-shell">
      <aside className="o-side">
        <div className="o-brand">
          <div className="o-brand-mark" aria-hidden />
          <div>
            <div className="o-brand-name">{props.brand}</div>
            <div className="o-brand-co">{props.companyName}</div>
          </div>
        </div>
        <div className="o-switch">
          <span>{props.portalName}</span>
          {props.portals.length > 1 ? (
            <select aria-label="Switch portal" value="" onChange={(e) => router.push(`/${e.target.value}`)}>
              <option value="">switch</option>
              {props.portals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="faint">switch</span>
          )}
        </div>
        <nav className="o-nav">{main.map(link)}</nav>
        {admin.length > 0 && (
          <>
            <div className="o-nav-title">Company admin</div>
            <nav className="o-nav">{admin.map(link)}</nav>
          </>
        )}
        <div className="o-side-foot">
          <strong>{props.user.name}</strong>
          {props.user.title}
          {props.companies.length > 1 && props.onSwitchCompany && (
            <select
              className="o-select"
              style={{ marginTop: 8, background: 'transparent', color: '#c9cfd5' }}
              aria-label="Switch company"
              defaultValue=""
              onChange={async (e) => {
                await props.onSwitchCompany!(e.target.value);
                router.refresh();
              }}
            >
              <option value="" disabled>
                Switch company
              </option>
              {props.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div>
            <a href={props.signOutHref} style={{ color: '#9aa3ab', fontSize: 12 }}>
              Sign out
            </a>
          </div>
        </div>
      </aside>
      <div className="o-main">{props.children}</div>
    </div>
  );
}

export function TopBar({ crumbs, children }: { crumbs: string[]; children?: ReactNode }) {
  return (
    <header className="o-top">
      <div className="o-crumbs">
        {crumbs.slice(0, -1).join(' / ')}
        {crumbs.length > 1 ? ' / ' : ''}
        <strong>{crumbs.at(-1)}</strong>
      </div>
      {children}
    </header>
  );
}
