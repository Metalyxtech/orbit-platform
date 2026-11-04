import type { ReactNode } from 'react';
import { NOT_READY, notReady } from '../../server';

/** Shows a short note instead of an error page before the database update (migration 0010). */
export function readyGuard(View: () => Promise<ReactNode>) {
  return async function Guarded() {
    try {
      return await View();
    } catch (err) {
      if (notReady(err)) return <p className="faint">{NOT_READY}</p>;
      throw err;
    }
  };
}
