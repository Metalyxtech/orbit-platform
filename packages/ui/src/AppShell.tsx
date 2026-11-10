'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { Avatar, Icon, isIconName } from './Icon';

export interface ShellNavItem {
  href: string;
  label: string;
  section: 'main' | 'admin';
  icon?: string;
  badge?: number;
}

export interface AppShellProps {
  brand: string;
  companyName: string;
  /** Shown as a marker in the sidebar when the company is not live yet. */
  companyStage?: 'sandbox' | 'pilot' | 'live';
  portalName: string;
  portals: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  nav: ShellNavItem[];
  user: { name: string; title: string | null };
  onSwitchCompany?: (companyId: string) => Promise<void>;
  /** Sign-out is a POST so other sites cannot trigger it. */
  signOutAction: string;
  children: ReactNode;
}

/** Sidebar (graphite) + portal and company switchers + signed-in user. */
export function AppShell(props: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) =>
    pathname === href || (href.split('/').length > 2 && pathname.startsWith(href + '/'));
  const main = props.nav.filter((n) => n.section === 'main');
  const admin = props.nav.filter((n) => n.section === 'admin');

  const link = (n: ShellNavItem) => (
    <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>
      {isIconName(n.icon) && <Icon name={n.icon} />}
      <span>{n.label}</span>
      {n.badge ? (
        <span className="o-badge" aria-label={`${n.badge} waiting`}>
          {n.badge > 99 ? '99+' : n.badge}
        </span>
      ) : null}
    </Link>
  );

  return (
    <div className="o-shell">
      <aside className="o-side">
        <div className="o-brand">
          <div className="o-brand-mark" aria-hidden />
          <div>
            <div className="o-brand-name">{props.brand}</div>
            <div className="o-brand-co" title={props.companyName}>
              {props.companyName}
            </div>
          </div>
        </div>
        {props.companyStage === 'sandbox' && (
          <div className="o-env" role="note">
            <b>Sandbox</b>
            <span>Emails only go to verified test addresses.</span>
          </div>
        )}
        {props.portals.length > 1 && (
          <div className="o-switch">
            <select
              aria-label="Switch portal"
              value={props.portals.find((p) => p.name === props.portalName)?.id ?? ''}
              onChange={(e) => router.push(`/${e.target.value}`)}
            >
              {props.portals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="o-navs">
          {[
            { title: props.portalName, items: main },
            { title: 'Company admin', items: admin },
          ]
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <Fragment key={g.title}>
                <div className="o-nav-title">{g.title}</div>
                <nav className="o-nav" aria-label={g.title}>
                  {g.items.map(link)}
                </nav>
              </Fragment>
            ))}
        </div>
        <div className="o-side-foot">
          {props.companies.length > 1 && props.onSwitchCompany && (
            <select
              aria-label="Switch company"
              value={props.companies.find((c) => c.name === props.companyName)?.id ?? ''}
              onChange={async (e) => {
                await props.onSwitchCompany!(e.target.value);
                router.refresh();
              }}
            >
              {props.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <div className="o-user">
            <Avatar name={props.user.name} />
            <div className="o-user-id">
              <strong title={props.user.name}>{props.user.name}</strong>
              {props.user.title && <span>{props.user.title}</span>}
            </div>
            <form action={props.signOutAction} method="post">
              <button className="o-iconbtn" type="submit" title="Sign out" aria-label="Sign out">
                <Icon name="signout" size={18} />
              </button>
            </form>
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
      <nav className="o-crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) =>
          i === crumbs.length - 1 ? (
            <strong key={i} aria-current="page">
              {c}
            </strong>
          ) : (
            <Fragment key={i}>
              <span>{c}</span>
              <i aria-hidden>/</i>
            </Fragment>
          ),
        )}
      </nav>
      {children}
    </header>
  );
}
