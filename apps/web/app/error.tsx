'use client';
import { useEffect, useState } from 'react';
import { looksStale, reloadOnce } from '@/stale-reload';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    // A new version of Orbit went live while this tab was open: load it.
    if (looksStale(error) && reloadOnce()) setReloading(true);
  }, [error]);
  if (reloading)
    return (
      <div className="o-page" style={{ maxWidth: 480, margin: '80px auto' }}>
        <p className="muted">Orbit was updated. Loading the new version…</p>
      </div>
    );
  return (
    <div className="o-page" style={{ maxWidth: 480, margin: '80px auto' }}>
      <h1>Something went wrong</h1>
      <p className="muted">Couldn't load this page. Please try again in a few seconds.</p>
      <div className="o-row">
        <button className="o-btn primary" onClick={reset}>
          Try again
        </button>
        <button className="o-btn" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
      {error.digest && (
        <p className="faint" style={{ fontSize: 11, marginTop: 16 }}>
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
