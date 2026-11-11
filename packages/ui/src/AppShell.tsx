'use client';
import { useRouter } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { toEntries } from './menu';
import { NotificationCenter } from './NotificationCenter';
import { SideFoot } from './SideFoot';
import { SideMenu } from './SideMenu';

export interface ShellNavItem {
  href: string;
  label: string;
  section: 'main' | 'admin';
  badge?: number;
  /** Admin section: which portal's settings this page belongs to ('Company' = company-wide). */
  group?: string;
  /** Main section: drop-down this page sits in (omitted = a main menu item). */
  menu?: string;
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
  /** Where the sign-out form posts. */
  signOutHref: string;
  children: ReactNode;
}

/** Sidebar (graphite) + top bar + portal switcher. */
export function AppShell(props: AppShellProps) {
  const router = useRouter();
  const main = props.nav.filter((n) => n.section === 'main');
  const admin = props.nav.filter((n) => n.section === 'admin');


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
          <NotificationCenter />
        </div>
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
        <SideMenu
          sections={[
            { entries: toEntries(main) },
            {
              title: 'Company admin',
              entries: toEntries(admin.map((n) => ({ ...n, menu: n.group && n.group !== 'Company' ? `${n.group} settings` : undefined }))),
            },
          ]}
        />
        <SideFoot name={props.user.name} title={props.user.title} signOutAction={props.signOutHref}>
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
        </SideFoot>
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
