import { query } from '@orbit/core/next';
import { KpiStrip } from '@orbit/ui';
import { fmtQty } from '../../config';
import { dashboard, notReady } from '../../server';
import { HoursByTrade, OrdersAtAGlance, ProductionCharts } from '../DashboardCharts';

const load = () => query((tx, ctx) => dashboard.dashboard(tx, ctx));
const NOT_YET = <p className="faint">Production switches on after the latest database update.</p>;

/** One-line Production summary for the Management overview. */
async function ProductionHeadline() {
  try {
    const k = (await load()).kpi;
    return (
      <KpiStrip
        items={[
          { value: String(k.open), label: 'Open work orders' },
          { value: String(k.floor), label: 'On the shop floor' },
          { value: String(k.late), label: 'Past due date', tone: k.late ? 'hivis' : undefined },
          { value: `${fmtQty(k.hoursToday)} h`, label: 'Hours reported today' },
        ]}
      />
    );
  } catch (err) {
    if (notReady(err)) return NOT_YET;
    throw err;
  }
}

/** Management > Production: the headline numbers, charts and every open work order on one line. */
async function ProductionOverview() {
  try {
    const d = await load();
    return (
      <>
        <ProductionCharts d={d} />
        <OrdersAtAGlance d={d} />
        <HoursByTrade d={d} />
      </>
    );
  } catch (err) {
    if (notReady(err)) return NOT_YET;
    throw err;
  }
}

/** The Production tab: headline numbers above the charts. */
async function ProductionTab() {
  return (
    <>
      <ProductionHeadline />
      <ProductionOverview />
    </>
  );
}

/** Production inside the Management workspace. */
export const productionManagement = {
  headline: ProductionHeadline,
  overview: ProductionOverview,
  tabs: [{ id: 'dashboard', label: 'Dashboard', View: ProductionTab }],
  links: [
    { label: 'Work orders', path: 'orders' },
    { label: 'Shop-floor board', path: 'board' },
    { label: 'Material requests', path: 'materials' },
  ],
};
