'use client';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { toEntries } from './menu';
import { NotificationCenter } from './NotificationCenter';
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
  /** role: who the person is in this portal (e.g. "Sales executive"); title: a second, quieter line. */
  user: { name: string; title: string | null; role?: string };
  onSwitchCompany?: (companyId: string) => Promise<void>;
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
            <div className="o-brand-co">{props.companyName}</div>
          </div>
          <NotificationCenter />
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
        <SideMenu
          sections={[
            { entries: toEntries(main) },
            {
              title: 'Company admin',
              entries: toEntries(admin.map((n) => ({ ...n, menu: n.group && n.group !== 'Company' ? `${n.group} settings` : undefined }))),
            },
          ]}
        />
        <div className="o-side-foot">
          <UserCard {...props.user} />
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
          <div style={{ fontSize: 11, marginTop: 10 }}>
            <a href={props.signOutHref} style={{ color: '#c9cfd5' }}>
              Sign out
            </a>
            <span style={{ color: '#5d666e' }}> · </span>
            <a href="/legal/terms" target="_blank" rel="noreferrer" style={{ color: '#9aa3ab' }}>
              Terms
            </a>
            <span style={{ color: '#5d666e' }}> · </span>
            <a href="/legal/privacy" target="_blank" rel="noreferrer" style={{ color: '#9aa3ab' }}>
              Privacy
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

/** Name with initials and the person's role here. A name that is still an email shows its first part. */
function UserCard({ name, title, role }: { name: string; title: string | null; role?: string }) {
  const shown = name.includes('@') ? name.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : name;
  const initials = shown
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <div className="o-user" title={name}>
      <span className="o-user-av" aria-hidden>
        {initials || '?'}
      </span>
      <span className="o-user-txt">
        <strong>{shown}</strong>
        {role && <span className="o-user-role">{role}</span>}
        {title && <span className="o-user-sub">{title}</span>}
      </span>
    </div>
  );
}
