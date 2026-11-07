import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { EmptyState } from '@orbit/ui';
import { money } from '@/billing/plans';
import { billingSettings } from '@/billing/state';
import { getCustomPlan } from '@/custom/plan';
import { AREAS, areaLabel, companyRequests, statusOf } from '@/custom/requests';
import { CustomRequestForm } from './CustomRequestForm';

export const dynamic = 'force-dynamic';

const when = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** Company admin > Custom requirements (custom customers only): send forms and changes to Orbit. */
export default async function CustomRequirements() {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const d = await query(async (tx, ctx) => {
    const plan = await getCustomPlan(tx, ctx.companyId);
    if (!plan?.enabled) return null;
    return { plan, requests: await companyRequests(tx, ctx.companyId), currency: (await billingSettings(tx, ctx.companyId)).currency };
  });
  if (!d) redirect('/manage');
  return (
    <>
      <header className="o-top">
        <strong>Custom requirements</strong>
      </header>
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Custom requirements</h1>
            <p>
              Send Orbit your own forms and the changes you need. Our team builds them in your company&apos;s custom portal ({d.plan.label}) and replies here.
            </p>
          </div>
        </div>
        {(d.plan.monthlyPrice || d.plan.yearlyPrice) && (
          <div className="o-banner info">
            Your custom plan: {[d.plan.monthlyPrice && `${money(d.plan.monthlyPrice, d.currency)} per month`, d.plan.yearlyPrice && `${money(d.plan.yearlyPrice, d.currency)} per year`].filter(Boolean).join(' or ')}
            {d.currency === 'INR' ? ' + GST' : ''}. Subscribe in Plan and billing.
          </div>
        )}
        <div className="o-split">
          <div className="o-panel">
            <div className="o-panel-head">
              <h2>New requirement</h2>
            </div>
            <CustomRequestForm areas={AREAS.map((a) => ({ id: a.id, label: a.label }))} />
          </div>
          <div className="o-stack" style={{ gap: 12 }}>
            {d.requests.length === 0 && <EmptyState title="Nothing sent yet." />}
            {d.requests.map((r) => {
              const st = statusOf(r.status);
              return (
                <div key={r.id} className="o-panel">
                  <div className="o-row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <strong>{r.title}</strong>
                    <span className={`o-chip ${st.tone}`}>{st.label}</span>
                  </div>
                  <p className="faint" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                    {areaLabel(r.area)} · sent {when(r.createdAt)} by {r.requestedName}
                  </p>
                  <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{r.details}</p>
                  {r.files.length > 0 && (
                    <p style={{ fontSize: 12, margin: '8px 0 0' }}>
                      {r.files.map((f) => (
                        <a key={f.id} href={`/api/custom-files/${f.id}?c=${r.companyId}`} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>
                          {f.fileName}
                        </a>
                      ))}
                    </p>
                  )}
                  {r.orbitNote && (
                    <div className="o-banner ok" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>
                      <strong>Orbit:</strong> {r.orbitNote}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
