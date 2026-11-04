'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@orbit/ui';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs one workflow action, shows the result and refreshes the request page. */
export function useStep() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run<T>(fn: () => Promise<Result<T>>, done: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast(res.error, 'bad');
      return false;
    }
    toast(done);
    router.refresh();
    return true;
  }
  return { busy, run, toast };
}
