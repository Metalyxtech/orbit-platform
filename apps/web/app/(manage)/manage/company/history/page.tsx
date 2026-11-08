import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { Chip, EmptyState } from '@orbit/ui';
import { listChanges, type ChangeArea } from '@/history';

export const dynamic = 'force-dynamic';

const AREAS: ChangeArea[] = ['Purchase', 'Timesheet', 'Sales', 'People and access', 'Company'];
const TONE: Record<ChangeArea, 'steel' | 'hivis' | 'ok' | 'grey'> = { Purchase: 'steel', Timesheet: 'hivis', Sales: 'steel', 'People and access': 'ok', Company: 'grey' };
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Change history: who changed what in workflows, forms, rules, roles and access. Admins and management. */
export default async function History({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await getSession();
  if (s.state !== 'ok' || (s.ctx.role !== 'company_admin' && s.ctx.role !== 'management')) redirect('/manage');
  const sp = await searchParams;
  const area = AREAS.find((a) => a === sp.area);
  const rows = await query((tx, ctx) => listChanges(tx, ctx, { area }));
  return (
    <>
      <header className="o-top">
        <strong>Change history</strong>
      </header>
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Change history</h1>
            <p>Every change to workflows, forms, approval rules, roles and portal access, with who made it and when.</p>
          </div>
        </div>
        <nav className="o-tabs" aria-label="Area">
          <Link href="?" aria-current={!area ? 'page' : undefined}>
            All
          </Link>
          {AREAS.map((a) => (
            <Link key={a} href={`?area=${encodeURIComponent(a)}`} aria-current={area === a ? 'page' : undefined}>
              {a}
            </Link>
          ))}
        </nav>
        <div className="o-panel flush">
          {rows.length === 0 ? (
            <EmptyState title="No changes recorded yet." />
          ) : (
            <ol className="h-list">
              {rows.map((r) => (
                <li key={r.id}>
                  <div className="h-when">{when(r.at)}</div>
                  <div className="h-body">
                    <div className="o-row" style={{ gap: 8 }}>
                      <Chip tone={TONE[r.area]}>{r.area}</Chip>
                      <strong>{r.label}</strong>
                    </div>
                    {r.details.length > 0 && (
                      <ul>
                        {r.details.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="h-who">
                    {r.who}
                    {r.whoTitle && <span>{r.whoTitle}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
