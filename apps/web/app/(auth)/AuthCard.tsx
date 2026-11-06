import type { ReactNode } from 'react';

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--graphite)', padding: 16 }}>
      <div className="o-panel" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
        <div className="o-row" style={{ marginBottom: 20 }}>
          <div className="o-brand-mark" style={{ borderColor: 'var(--graphite)' }} aria-hidden />
          <strong style={{ fontSize: 18 }}>Orbit</strong>
        </div>
        <h1 style={{ marginBottom: 12 }}>{title}</h1>
        {children}
        <p className="faint" style={{ fontSize: 11, marginTop: 20, marginBottom: 0, textAlign: 'center' }}>
          <a href="/legal/terms">Terms and Conditions</a> · <a href="/legal/privacy">Privacy Policy</a>
        </p>
      </div>
    </main>
  );
}
