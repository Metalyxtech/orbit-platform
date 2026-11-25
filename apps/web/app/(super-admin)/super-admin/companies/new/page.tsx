import Link from 'next/link';
import { TRIAL_DAYS } from '@/billing/plans';
import { standardPortals } from '@/portals';
import { createCompanyAction } from '../../billing-actions';
import { requireSuperAdminPage } from '../../data';
import { TIMEZONES } from '../../new-company';

export const dynamic = 'force-dynamic';

/** Super Admin > Companies > Add company: set up a client who contacted SteelConnect360. */
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
          For a client who contacted the SteelConnect360 team. The company is active straight away. Its admin signs in with the email below and lands in the Company admin portal.
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
              <h2>Company admins</h2>
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
            <h3 style={{ fontSize: 13, margin: '16px 0 4px' }}>Second admin (optional)</h3>
            <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
              Same access as the first admin. Leave blank for one admin; you can add one later on the company page.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label className="o-field">
                Name
                <input className="o-input" name="admin2Name" minLength={2} maxLength={120} />
              </label>
              <label className="o-field">
                Email (they sign in with this)
                <input className="o-input" name="admin2Email" type="email" maxLength={200} />
              </label>
              <label className="o-field">
                Job title
                <input className="o-input" name="admin2Title" maxLength={100} placeholder="Company admin" />
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
              <label className="o-row" style={{ gap: 8, fontSize: 13, color: 'var(--ink)', marginTop: 6 }}>
                <input type="checkbox" name="customOnly" />
                Custom portal only (no Timesheet or Purchase): the admin sends their forms in Custom portals
              </label>
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
                  <option value="hide">Hidden: SteelConnect360 arranges the plan</option>
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
