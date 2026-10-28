'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="o-page" style={{ maxWidth: 480, margin: '80px auto' }}>
      <h1>Something went wrong</h1>
      <p className="muted">Couldn't load this page. Please try again in a few seconds.</p>
      <button className="o-btn primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
