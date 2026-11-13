import type { ReactNode } from 'react';

/** Sign-in, registration and waiting screens: brand panel on the left, the task on the right. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="o-auth">
      <aside className="o-auth-brand">
        <div className="o-brand" style={{ padding: 0 }}>
          <div className="o-brand-mark" aria-hidden />
          <div className="o-brand-name" style={{ fontSize: 17 }}>
            Orbit
          </div>
        </div>
        <h2>One place for your company's timesheets, purchasing and sales.</h2>
        <ul>
          <li>Weekly timesheets with approval routes</li>
          <li>Purchase requests from requisition to invoice</li>
          <li>Enquiries, quotations and orders in one pipeline</li>
        </ul>
        <small>Your company's data is kept separate from every other company.</small>
      </aside>
      <div className="o-auth-main">
        <div className="o-auth-card">
          <div className="o-brand">
            <div className="o-brand-mark dark" aria-hidden />
            <div className="o-brand-name">Orbit</div>
          </div>
          <h1>{title}</h1>
          {children}
          <p className="o-auth-legal">
            <a href="/legal/terms">Terms and Conditions</a> · <a href="/legal/privacy">Privacy Policy</a>
          </p>
        </div>
      </div>
    </main>
  );
}
