'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@orbit/ui';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs one action, shows the result and refreshes the page. */
export function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run<T>(fn: () => Promise<Result<T>>, done?: string): Promise<T | null> {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast(res.error, 'bad');
      return null;
    }
    if (done) toast(done);
    router.refresh();
    return res.data;
  }
  return { busy, run, toast, router };
}
