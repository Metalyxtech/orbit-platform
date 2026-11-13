'use client';
import { useEffect } from 'react';
import { looksStale, reloadOnce } from '@/stale-reload';

/**
 * Last-resort error page (an error in the root layout itself). Replaces the browser's bare
 * "Application error" text: reloads once after a new deploy, otherwise offers a reload.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (looksStale(error)) reloadOnce();
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f7f7f5', color: '#1f2328' }}>
        <div style={{ maxWidth: 480, margin: '80px auto', padding: 16 }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: '#59636e' }}>Orbit could not load this page. Reloading usually fixes it.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '8px 16px', borderRadius: 6, border: 0, background: '#2d5b8a', color: '#fff', cursor: 'pointer' }}>
            Reload page
          </button>
          {error.digest && <p style={{ fontSize: 11, color: '#8c959f', marginTop: 16 }}>Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
