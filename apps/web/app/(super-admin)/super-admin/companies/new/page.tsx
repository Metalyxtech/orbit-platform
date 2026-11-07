import Link from 'next/link';
import { TRIAL_DAYS } from '@/billing/plans';
import { standardPortals } from '@/portals';
import { createCompanyAction } from '../../billing-actions';
import { requireSuperAdminPage } from '../../data';
import { TIMEZONES } from '../../new-company';

export const dynamic = 'force-dynamic';

/** Super Admin > Companies > Add company: set up a client who contacted Orbit. */
export default async function NewCompany({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireSuperAdminPage();
  const error = (await searchParams).error;
  const portals = standardPortals().map((m) => m.manifest);
  return (
    <>
      <header className="o-top">
        <span className="faint">
          <Link href="/super-admin">Companies</Link> /
        </span>
        <strong>Add company</strong>
      </header>
      <div className="o-page" style={{ maxWidth: 760 }}>
        <p className="muted" style={{ margin: 0 }}>
          For a client who contacted the Orbit team. The company is active straight away. Its admin signs in with the email below and lands in the Company admin portal.
        </p>
        {error && (
          <div className="o-banner bad" role="alert">
            {error}
          </div>
        )}
        <form action={createCompanyAction} className="o-stack" style={{ gap: 16 }}>
          <div className="o-panel">
            <div className="o-panel-head">
              <h2>Company</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label className="o-field">
                Company name
                <input className="o-input" name="name" required minLength={2} maxLength={120} />
              </label>
              <label className="o-field">
                Country
                <select className="o-select" name="country" defaultValue="india">
                  <option value="india">India: pays in rupees (₹, GST extra)</option>
                  <option value="abroad">Outside India: pays in US dollars ($)</option>
                </select>
              </label>
              <label className="o-field">
                Time zone
                <select className="o-select" name="timezone" defaultValue="Asia/Kolkata">
                  {TIMEZONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="o-field">
                Stage
                <select className="o-select" name="stage" defaultValue="live">
                  <option value="live">Live</option>
                  <option value="pilot">Pilot</option>
                  <option value="sandbox">Sandbox (test emails only)</option>
                </select>
              </label>
            </div>
          </div>

          <div className="o-panel">
            <div className="o-panel-head">
              <h2>Company admin</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label className="o-field">
                Name
                <input className="o-input" name="adminName" required minLength={2} maxLength={120} />
              </label>
              <label className="o-field">
                Email (they sign in with this)
                <input className="o-input" name="adminEmail" type="email" required maxLength={200} />
              </label>
              <label className="o-field">
                Job title
                <input className="o-input" name="adminTitle" maxLength={100} placeholder="Company admin" />
              </label>
            </div>
          </div>

          <div className="o-panel">
            <div className="o-panel-head">
              <h2>Portals and subscription</h2>
            </div>
            <fieldset className="o-field" style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
              <legend style={{ marginBottom: 4 }}>Portals switched on</legend>
              {portals.map((p) => (
                <label key={p.id} className="o-row" style={{ gap: 8, fontSize: 13, color: 'var(--ink)' }}>
                  <input type="checkbox" name="portals" value={p.id} defaultChecked />
                  {p.name}
                </label>
              ))}
            </fieldset>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label className="o-field">
                Free trial (days)
                <input className="o-input" name="trialDays" type="number" min={0} max={90} defaultValue={TRIAL_DAYS} />
              </label>
              <label className="o-field">
                Subscription plans
                <select className="o-select" name="showPlans" defaultValue="show">
                  <option value="show">Released: the admin sees plans and pays online</option>
                  <option value="hide">Hidden: Orbit arranges the plan</option>
                </select>
              </label>
            </div>
            <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
              Indian companies see prices in rupees; companies outside India see the same plans in US dollars (₹90 = $1). You can change this later on the company page.
            </p>
          </div>

          <div className="o-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Link className="o-btn" href="/super-admin">
              Cancel
            </Link>
            <button className="o-btn primary" type="submit">
              Add company
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
