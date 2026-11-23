'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Shows the "subscription ended" pop-up on every page except the ones that stay open. */
export function LockSwitch({ open, locked, children }: { open: string[]; locked: ReactNode; children: ReactNode }) {
  const path = usePathname();
  return <>{open.some((p) => path === p || path.startsWith(`${p}/`)) ? children : locked}</>;
}
