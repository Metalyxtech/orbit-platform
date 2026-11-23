'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@orbit/ui';

/** Save helper for the admin pages: busy state, toast and refresh. */
export function useSave() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function save<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad'), false;
    toast(done);
    router.refresh();
    return true;
  }
  return { busy, save };
}
