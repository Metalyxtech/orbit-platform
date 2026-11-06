import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { KpiStrip } from '@orbit/ui';
import { DOCUMENTS, LEGAL_DOCS, type LegalDoc } from '@/legal/documents';
import { LegalText } from '@/legal/LegalText';
import { companySignatures } from '@/legal/state';

export const dynamic = 'force-dynamic';

const ROLE: Record<string, string> = { company_admin: 'Company admin', management: 'Management', project_manager: 'Project manager', supervisor: 'Supervisor', employee: 'Employee' };
const when = (d: Date) => d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Company admin > Terms and privacy: read the documents and see who in the company has signed. */
export default async function Legal({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const doc = DOCUMENTS[((await searchParams).doc as LegalDoc) ?? 'terms'] ?? DOCUMENTS.terms;
  const people = await query((tx, ctx) => companySignatures(tx, ctx.companyId));
  const signed = people.filter((p) => p.signedAt);
  const me = people.find((p) => p.userId === s.ctx.userId);
  return (
    <>
      <header className="o-top">
        <strong>Terms and privacy</strong>
      </header>
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Terms and privacy</h1>
            <p>
              The agreement between {s.ctx.companyName} and Orbit. Everyone signs the current version the first time they open Orbit.
              {me?.signedAt && ` You signed on behalf of the company on ${when(me.signedAt)}.`}
            </p>
          </div>
        </div>
        <KpiStrip
          items={[
            { value: String(signed.length), label: 'People signed' },
            { value: String(people.length - signed.length), label: 'Not signed yet', tone: people.length - signed.length ? 'hivis' : undefined },
            ...LEGAL_DOCS.map((d) => ({ value: d.version, label: `${d.title} version` })),
          ]}
        />
        <div className="o-split">
          <div className="o-panel">
            <div className="o-row" style={{ gap: 6, marginBottom: 10 }} role="tablist">
              {LEGAL_DOCS.map((d) => (
                <Link key={d.id} role="tab" aria-selected={d.id === doc.id} className={`o-btn small${d.id === doc.id ? ' primary' : ''}`} href={`/manage/company/legal?doc=${d.id}`}>
                  {d.title}
                </Link>
              ))}
              <a className="o-btn small" href={`/legal/${doc.id}`} target="_blank" rel="noreferrer">
                Open to print
              </a>
            </div>
            <LegalText doc={doc} />
          </div>
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Who has signed</h2>
            </div>
            <div className="o-scroll">
              <table className="o-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Role</th>
                    <th>Signed</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.userId}>
                      <td>
                        {p.name}
                        <div className="faint" style={{ fontSize: 11 }}>{p.email}</div>
                      </td>
                      <td>{ROLE[p.role] ?? p.role}</td>
                      <td>
                        {p.signedAt ? (
                          <>
                            <span className="o-chip ok">Signed</span>
                            <div className="faint" style={{ fontSize: 11 }}>
                              {p.signedName} · {when(p.signedAt)}
                            </div>
                            <div className="o-row" style={{ gap: 8, fontSize: 11 }}>
                              {p.copies.map(
                                (c) =>
                                  c.id && (
                                    <Link key={c.doc} href={`/manage/company/legal/copy/${c.id}`}>
                                      {c.doc === 'terms' ? 'Terms copy' : 'Privacy copy'}
                                    </Link>
                                  ),
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="o-chip warn" title="Asked to sign at their next sign-in">Not yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
