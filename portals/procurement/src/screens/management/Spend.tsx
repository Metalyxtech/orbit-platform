import { query } from '@orbit/core/next';
import { DataTable, EmptyState, PieChart } from '@orbit/ui';
import { dashboard } from '../../server';
import { fmtMoney, fmtQty } from '../ui';

/** Management > Purchase > Spend and stock: ordered value by supplier, and stock to reorder. */
export async function SpendView() {
  const d = await query((tx, ctx) => dashboard.managementView(tx, ctx));
  return (
    <div className="o-half">
      <div className="o-panel">
        <h2>Ordered by supplier</h2>
        {d.bySupplier.length ? <PieChart unit={d.currency} slices={d.bySupplier.map((s) => ({ label: s.label, value: s.value }))} /> : <EmptyState title="No purchase orders yet." />}
      </div>
      <div className="o-panel flush">
        <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
          <h2>Stock to reorder</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            Stock value {fmtMoney(d.currency, d.kpis.stockValue)}
          </span>
        </div>
        <DataTable
          rows={d.low}
          rowKey={(r) => r.id}
          empty={<span className="faint">Stock is healthy.</span>}
          columns={[
            { key: 'i', header: 'Item', render: (r) => <><strong>{r.code}</strong> {r.name}</> },
            { key: 'a', header: 'Available', num: true, render: (r) => `${fmtQty(r.available)} ${r.unit}` },
            { key: 'm', header: 'Reorder at', num: true, render: (r) => fmtQty(r.reorderLevel) },
          ]}
        />
      </div>
    </div>
  );
}
