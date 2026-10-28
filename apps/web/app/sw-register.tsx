'use client';
import { useEffect } from 'react';

/** PWA: installable, offline shell. Drafts live in IndexedDB (see MyWeekClient). */
export function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
