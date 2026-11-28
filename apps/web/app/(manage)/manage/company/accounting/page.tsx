import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { accountingPage } from '@/accounting/admin';
import { loadOptions } from '@/accounting/send';
import { AccountingClient } from './AccountingClient';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  not_set_up: 'This accounts software is not switched on for SteelConnect360 yet. Contact SteelConnect360 support.',
  refused: 'Access was not allowed, so nothing was connected.',
  expired: 'The connection took too long or was started in another window. Press Connect again.',
  provider: 'The accounts software did not accept the connection. Press Connect again; if it keeps happening, check you are an admin there.',
  failed: 'Could not finish connecting. Try again.',
  unknown: 'Unknown accounts software.',
};

/** Company admin > Accounting: connect Tally, Zoho Books, QuickBooks or Xero and send invoices and bills. */
export default async function Accounting({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const sp = await searchParams;
  const data = await query((tx, ctx) => accountingPage(tx, ctx));
  const options = data.active && data.active.provider !== 'tally' ? await loadOptions(s.ctx.companyId) : { fields: [], error: null };
  return (
    <>
      <header className="o-top">
        <strong>Accounting</strong>
      </header>
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Accounting</h1>
            <p>Send Sales invoices and Purchase bills to your accounts software, so nobody types them in twice.</p>
          </div>
        </div>
        {sp.connected && <div className="o-banner ok">Connected. Choose your accounts below, then send your first invoice.</div>}
        {sp.error && <div className="o-banner bad">{ERRORS[sp.error] ?? ERRORS.failed}</div>}
        <AccountingClient data={data} fields={options.fields} optionsError={options.error} />
      </div>
    </>
  );
}
