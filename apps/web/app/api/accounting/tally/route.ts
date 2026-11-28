import { NextResponse, type NextRequest } from 'next/server';
import { accountingDocs, type AcctDocKind } from '@orbit/core/accounting';
import { getSession, query, runAction } from '@orbit/core/next';
import { activeConnection, recordSync, syncRows } from '@/accounting/store';
import { tallyMastersXml, tallySettings, tallyVouchersXml } from '@/accounting/tally';

export const dynamic = 'force-dynamic';

const KINDS: AcctDocKind[] = ['sales_invoice', 'purchase_bill'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tally files: ?part=masters (customer and supplier ledgers, import first) or ?part=vouchers
 * (invoices and bills). Optional ?kind=, ?from=, ?to= and ?only=new (not exported before).
 * Downloading the vouchers marks those documents as exported.
 */
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') return new NextResponse('Only the company admin can export to Tally', { status: 403 });
  const p = req.nextUrl.searchParams;
  const part = p.get('part') === 'masters' ? 'masters' : 'vouchers';
  const kinds = KINDS.filter((k) => !p.get('kind') || p.get('kind') === k);
  const from = DATE.test(p.get('from') ?? '') ? p.get('from')! : undefined;
  const to = DATE.test(p.get('to') ?? '') ? p.get('to')! : undefined;
  const onlyNew = p.get('only') === 'new';
  const got = await query(async (tx, ctx) => {
    const row = await activeConnection(tx, ctx.companyId);
    if (!row || row.provider !== 'tally') return null;
    const docs = [];
    for (const kind of kinds) {
      const list = await accountingDocs(tx, ctx.companyId, kind, { from, to });
      const done = onlyNew ? new Set((await syncRows(tx, ctx.companyId, 'tally', kind, list.map((d) => d.id))).filter((x) => x.status === 'exported').map((x) => x.docId)) : new Set<string>();
      docs.push(...list.filter((d) => !done.has(d.id)));
    }
    return { settings: tallySettings(row.settings), docs: docs.sort((a, b) => a.date.localeCompare(b.date)) };
  });
  if (!got) return new NextResponse('Choose Tally on the Accounting page first', { status: 400 });
  if (!got.docs.length) return new NextResponse('Nothing to export for these dates', { status: 404 });
  const xml = part === 'masters' ? tallyMastersXml(got.settings, got.docs) : tallyVouchersXml(got.settings, got.docs);
  if (part === 'vouchers') {
    await runAction(async (tx, ctx) => {
      for (const d of got.docs) await recordSync(tx, ctx.companyId, { provider: 'tally', kind: d.kind, docId: d.id, docNumber: d.number, status: 'exported', byId: ctx.membershipId });
    });
  }
  const name = `steelconnect360-tally-${part}-${new Date().toISOString().slice(0, 10)}.xml`;
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
}
