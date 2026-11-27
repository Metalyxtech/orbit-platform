import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { joinableCompanies } from '@/company-directory';
import Link from 'next/link';
import { INDUSTRIES, isIndustry, type Industry } from '@orbit/core';
import { PORTAL_DETAIL, portalsForIndustry } from '@/industry-portals';
import { standardPortals } from '@/portals';
import { joinCompanyAction, registerCompanyAction } from '@/session-actions';
import { AuthCard } from '../AuthCard';
import { requireAgreement } from '@/legal/gate';

export const dynamic = 'force-dynamic';

const errors: Record<string, string> = {
  not_found: 'That company is not available to join right now. Ask your company admin.',
  choose: 'Choose your company from the list.',
  exists: 'A company with that name is already registered. Use "Join your company" above instead.',
  portals: 'Choose at least one portal, or a custom portal.',
  no_portal: 'That company does not use the portal you chose. Check with your company admin.',
};

function PortalPicker({ hint, industry }: { hint: string; industry?: Industry }) {
  // Joining: every portal; registering: the chosen company type's portals.
  const portalList = (industry ? portalsForIndustry(industry) : standardPortals()).map((m) => m.manifest);
  return (
    <fieldset className="o-field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ marginBottom: 4 }}>Portals</legend>
      {portalList.map((p, i) => (
        <label key={p.id} className="o-row" style={{ gap: 8, fontSize: 13, color: 'var(--ink)', alignItems: 'flex-start' }}>
          <input type="checkbox" name="portals" value={p.id} defaultChecked={i === 0} style={{ marginTop: 3 }} />
          <span>
            {p.name}
            {industry && (
              <span className="faint" style={{ display: 'block', fontSize: 11 }}>
                {PORTAL_DETAIL[industry][p.id]}
              </span>
            )}
          </span>
        </label>
      ))}
      <span className="faint" style={{ fontSize: 11 }}>{hint}</span>
    </fieldset>
  );
}

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string; type?: string }> }) {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state !== 'no_company') redirect('/');
  await requireAgreement(s);
  const sp = await searchParams;
  const error = errors[sp.error ?? ''];
  const industry: Industry = isIndustry(sp.type) ? sp.type : 'manufacturing';
  const list = await joinableCompanies();
  return (
    <AuthCard title="Join your company">
      <p className="muted" style={{ fontSize: 13 }}>
        Signed in as {s.email}. If your company already uses SteelConnect360, choose it below. Your company admin approves the request and
        sets your role.
      </p>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--bad)' }}>
          {error}
        </p>
      )}
      <form action={joinCompanyAction} className="o-stack" style={{ gap: 12 }}>
        <label className="o-field">
          Company
          <select className="o-select" name="companyId" required defaultValue="">
            <option value="" disabled>
              {list.length ? 'Choose your company' : 'No companies to join yet'}
            </option>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <PortalPicker hint="The portals you need. Your admin approves the request." />
        <button className="o-btn primary block" type="submit">
          Request to join
        </button>
      </form>

      <h2 style={{ fontSize: 15, margin: '24px 0 8px' }}>New to SteelConnect360? Register your company</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        You become its company admin once SteelConnect360 approves the registration.
      </p>
      <form action={registerCompanyAction} className="o-stack" style={{ gap: 12 }}>
        <fieldset className="o-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 4 }}>Type of company</legend>
          <div className="o-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {INDUSTRIES.map((i) => (
              <Link key={i.id} href={`?type=${i.id}`} aria-current={industry === i.id ? 'page' : undefined} className={`o-btn small${industry === i.id ? ' primary' : ''}`}>
                {i.name}
              </Link>
            ))}
          </div>
          <span className="faint" style={{ fontSize: 11 }}>{INDUSTRIES.find((i) => i.id === industry)?.detail}</span>
          <input type="hidden" name="industry" value={industry} />
        </fieldset>
        <label className="o-field">
          Company name
          <input className="o-input" name="name" required minLength={2} maxLength={120} />
        </label>
        <label className="o-field">
          Your job title
          <input className="o-input" name="title" maxLength={100} placeholder="Company admin" />
        </label>
        <label className="o-field">
          Time zone
          <select className="o-select" name="timezone" defaultValue="Asia/Kolkata">
            {['Asia/Kolkata', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Europe/London', 'Australia/Perth', 'UTC'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <PortalPicker industry={industry} hint="The portals your company needs. SteelConnect360 reviews and switches them on." />
        <fieldset className="o-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <label className="o-row" style={{ gap: 8, fontSize: 13, color: 'var(--ink)' }}>
            <input type="checkbox" name="custom" />A custom portal built for our company
          </label>
          <textarea className="o-input" name="customDetails" rows={2} maxLength={2000} placeholder="What should it do? (optional; you can send your forms after sign-up)" />
          <span className="faint" style={{ fontSize: 11 }}>Choose only this if you do not need Timesheet or Purchase. SteelConnect360 replies with a price.</span>
        </fieldset>
        <button className="o-btn block" type="submit">
          Register company
        </button>
      </form>
    </AuthCard>
  );
}
