'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/super-admin/requests', label: 'Requests' },
  { href: '/super-admin', label: 'Companies' },
  { href: '/super-admin/subscriptions', label: 'Subscriptions' },
  { href: '/super-admin/people', label: 'People' },
  { href: '/super-admin/agreements', label: 'Agreements' },
];

export function SuperNav({ requests, payments = 0 }: { requests: number; payments?: number }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === '/super-admin' ? pathname === href || pathname.startsWith('/super-admin/companies') : pathname.startsWith(href);
  return (
    <nav className="o-nav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined}>
          {i.label}
          {i.href.endsWith('/requests') && requests > 0 ? <span className="o-badge">{requests}</span> : null}
          {i.href.endsWith('/subscriptions') && payments > 0 ? (
            <span className="o-badge" title="New payment confirmations">
              {payments}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
