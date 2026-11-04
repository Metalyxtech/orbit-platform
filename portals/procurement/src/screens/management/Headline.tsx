import { query } from '@orbit/core/next';
import { KpiStrip } from '@orbit/ui';
import { dashboard, notReady } from '../../server';
import { fmtK } from '../ui';

/** One-line Purchase summary for the Management overview. */
export async function PurchaseHeadline() {
  try {
    const d = await query((tx, ctx) => dashboard.dashboard(tx, ctx));
    return (
      <KpiStrip
        items={[
          { value: String(d.kpis.open), label: 'Open requests' },
          { value: String(d.pipeline.filter((p) => p.stage === 'pr_approval' || p.stage === 'po_approval').reduce((t, p) => t + p.count, 0)), label: 'Waiting for approval', tone: 'hivis' },
          { value: fmtK(d.currency, d.kpis.poMonth), label: 'Ordered this month' },
          { value: String(d.kpis.late), label: 'Past need-by date' },
        ]}
      />
    );
  } catch (err) {
    if (notReady(err)) return <p className="faint">Purchase switches on after the latest database update.</p>;
    throw err;
  }
}
