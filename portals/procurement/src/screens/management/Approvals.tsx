import { query } from '@orbit/core/next';
import { StackedBarChart } from '@orbit/ui';
import { dashboard } from '../../server';
import { RequestTable } from '../ui';

/** Management > Purchase > Approvals waiting: who has to sign off and for how long. */
export async function ApprovalsView() {
  const d = await query((tx, ctx) => dashboard.managementView(tx, ctx));
  const by = new Map<string, number>();
  for (const r of d.waiting) by.set(r.owner ?? 'Nobody', (by.get(r.owner ?? 'Nobody') ?? 0) + 1);
  return (
    <>
      <div className="o-panel">
        <h2>Waiting for approval by approver</h2>
        <StackedBarChart series={[{ name: 'Requests', color: '#c94f6d' }]} rows={[...by.entries()].map(([label, n]) => ({ label, parts: [n] }))} />
      </div>
      <div className="o-panel flush">
        <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
          <h2>Approvals waiting ({d.waiting.length})</h2>
        </div>
        <RequestTable rows={d.waiting} currency={d.currency} empty="Nothing is waiting for approval." />
      </div>
    </>
  );
}
