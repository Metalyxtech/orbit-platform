import Link from 'next/link';
import type { CustomPlan } from '@/custom/plan';
import { statusOf, type CustomRequest } from '@/custom/requests';
import { saveCustomPlanAction } from '../../custom-actions';

/** Company page > Custom work: make this a custom customer, set its own price, see its requests. */
export function CustomPanel({ companyId, plan, requests, currency }: { companyId: string; plan: CustomPlan | null; requests: CustomRequest[]; currency: 'INR' | 'USD' }) {
  const unit = currency === 'USD' ? '$' : '₹';
  const open = requests.filter((r) => r.status !== 'ready' && r.status !== 'declined');
  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>Custom work</h2>
        <span className={`o-chip ${plan?.enabled ? 'ok' : ''}`}>{plan?.enabled ? 'Custom customer' : 'Off'}</span>
      </div>
      <form action={saveCustomPlanAction.bind(null, companyId)} className="o-stack" style={{ gap: 10 }}>
        <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="enabled" defaultChecked={plan?.enabled ?? false} />
          Custom customer (sees Custom requirements and their own plan)
        </label>
        <label className="o-field">
          Plan name shown to the customer
          <input className="o-input" name="label" defaultValue={plan?.label ?? 'Custom plan'} maxLength={120} />
        </label>
        <div className="o-row" style={{ gap: 10 }}>
          <label className="o-field" style={{ flex: 1 }}>
            Monthly price ({unit})
            <input className="o-input" name="monthlyPrice" type="number" min={1} defaultValue={plan?.monthlyPrice ?? ''} placeholder="Not offered" />
          </label>
          <label className="o-field" style={{ flex: 1 }}>
            Yearly price ({unit})
            <input className="o-input" name="yearlyPrice" type="number" min={1} defaultValue={plan?.yearlyPrice ?? ''} placeholder="Not offered" />
          </label>
        </div>
        <label className="o-field">
          People allowed
          <input className="o-input" name="maxUsers" type="number" min={1} defaultValue={plan?.maxUsers ?? ''} placeholder="No limit" />
        </label>
        <label className="o-field">
          Internal note (what is included)
          <textarea className="o-input" name="note" rows={2} maxLength={2000} defaultValue={plan?.note ?? ''} />
        </label>
        <button className="o-btn small primary" type="submit" style={{ alignSelf: 'flex-start' }}>
          Save custom work
        </button>
      </form>
      <p className="faint" style={{ fontSize: 12, margin: '10px 0 6px' }}>
        Prices are in the company&apos;s currency{currency === 'INR' ? ', GST extra' : ''}. The custom portal is switched on under Portals below once it is built.
      </p>
      {requests.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, margin: '12px 0 6px' }}>
            Requirements ({open.length} open of {requests.length})
          </h3>
          <ul className="o-stack" style={{ gap: 4, listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
            {requests.slice(0, 6).map((r) => (
              <li key={r.id} className="o-row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <Link href={`/super-admin/custom/${companyId}/${r.id}`}>{r.title}</Link>
                <span className={`o-chip ${statusOf(r.status).tone}`}>{statusOf(r.status).label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
