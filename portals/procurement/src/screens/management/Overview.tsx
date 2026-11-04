import Link from 'next/link';
import { query } from '@orbit/core/next';
import { StackedBarChart } from '@orbit/ui';
import { dashboard } from '../../server';
import { Pipeline, RequestTable } from '../ui';
import { PurchaseHeadline } from './Headline';

/** Management > Purchase > Overview: headline, pipeline and late requests. */
export async function OverviewView() {
  const d = await query((tx, ctx) => dashboard.managementView(tx, ctx));
  return (
    <>
      <PurchaseHeadline />
      <div className="o-panel">
        <div className="o-panel-head">
          <h2>Pipeline</h2>
          <Link className="o-btn small" href="/procurement/requests">
            All requests
          </Link>
        </div>
        <Pipeline stages={d.pipeline} currency={d.currency} />
      </div>
      <div className="o-half">
        <div className="o-panel">
          <h2>Open requests by stage</h2>
          <StackedBarChart series={[{ name: 'Requests', color: '#2f5d8a' }]} rows={d.pipeline.filter((p) => p.count).map((p) => ({ label: p.label, parts: [p.count] }))} />
        </div>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Past need-by date</h2>
          </div>
          <RequestTable rows={d.late} currency={d.currency} empty="Nothing is late." />
        </div>
      </div>
      {d.byProject.length > 0 && (
        <div className="o-panel">
          <h2>Ordered by project</h2>
          <StackedBarChart unit={d.currency} series={[{ name: 'Ordered', color: '#2f5d8a' }]} rows={d.byProject.map((p) => ({ label: p.label, parts: [p.value] }))} />
        </div>
      )}
    </>
  );
}
