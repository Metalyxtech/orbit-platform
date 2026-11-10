'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="o-state">
      <div>
        <div className="o-brand-mark dark" aria-hidden />
        <h1>Something went wrong</h1>
        <p>Couldn't load this page. Nothing you entered was lost; please try again in a few seconds.</p>
        <button className="o-btn primary" onClick={reset}>
          Try again
        </button>
        {error.digest && <span className="code">Reference {error.digest}</span>}
      </div>
    </div>
  );
}
