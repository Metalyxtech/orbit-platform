import { query } from '@orbit/core/next';
import { TopBar } from '@orbit/ui';
import { custom1Manifest } from '../manifest';

/** Starting screen. Replace with the customer's forms, lists and approvals as they are built. */
const Home = async () => {
  const company = await query(async (_tx, ctx) => ctx.companyName);
  return (
    <>
      <TopBar crumbs={[custom1Manifest.name, 'Home']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>{custom1Manifest.name}</h1>
            <p>Built for {company}. Forms and approvals agreed with Orbit appear here as they are delivered.</p>
          </div>
        </div>
        <div className="o-panel">
          <p style={{ margin: 0, fontSize: 13 }}>
            Your company admin can send forms and changes from <strong>Company admin › Custom requirements</strong>.
          </p>
        </div>
      </div>
    </>
  );
};

export const custom1Routes = { '': Home };
