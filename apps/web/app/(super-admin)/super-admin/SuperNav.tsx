'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/super-admin', label: 'Companies' },
  { href: '/super-admin/people', label: 'People' },
];

export function SuperNav() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === '/super-admin' ? pathname === href || pathname.startsWith('/super-admin/companies') : pathname.startsWith(href);
  return (
    <nav className="o-nav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
