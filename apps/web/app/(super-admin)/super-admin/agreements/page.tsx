import { KpiStrip } from '@orbit/ui';
import { DOCUMENTS, LEGAL_DOCS, type LegalDoc } from '@/legal/documents';
import { allSignatures } from '@/legal/state';
import { requireSuperAdminPage } from '../data';

export const dynamic = 'force-dynamic';

const ROLE: Record<string, string> = { company_admin: 'Company admin (for the company)', management: 'Management', project_manager: 'Project manager', supervisor: 'Supervisor', employee: 'Employee' };
const when = (d: Date) => d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Super Admin > Agreements: every signature of the Terms and the Privacy Policy, newest first. */
export default async function Agreements({ searchParams }: { searchParams: Promise<{ company?: string; q?: string }> }) {
  const me = await requireSuperAdminPage();
  const sp = await searchParams;
  const all = await allSignatures(me.userId);
  const q = (sp.q ?? '').trim().toLowerCase();
  const rows = all.filter(
    (r) => (!sp.company || r.companyId === sp.company) && (!q || `${r.name} ${r.email} ${r.signedName} ${r.company ?? ''}`.toLowerCase().includes(q)),
  );
  const companies = [...new Map(all.filter((r) => r.companyId).map((r) => [r.companyId!, r.company ?? ''])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const people = new Set(all.map((r) => r.email)).size;
  const admins = new Set(all.filter((r) => r.role === 'company_admin').map((r) => r.companyId)).size;
  const today = all.filter((r) => Date.now() - r.at.getTime() < 864e5).length;

  return (
    <>
      <header className="o-top">
        <strong>Agreements</strong>
      </header>
      <div className="o-page">
        <p className="muted" style={{ margin: 0 }}>
          Terms and Conditions (version {DOCUMENTS.terms.version}) and Privacy Policy (version {DOCUMENTS.privacy.version}) signed by company admins and their people.
        </p>
        <KpiStrip
          items={[
            { value: String(people), label: 'People signed' },
            { value: String(admins), label: 'Companies signed by their admin' },
            { value: String(today), label: 'Signatures in the last 24 hours', tone: today ? 'hivis' : undefined },
          ]}
        />
        <form className="o-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select className="o-select" name="company" defaultValue={sp.company ?? ''} style={{ maxWidth: 260 }}>
            <option value="">All companies</option>
            {companies.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <input className="o-input" name="q" defaultValue={sp.q ?? ''} placeholder="Search name or email" style={{ maxWidth: 260 }} />
          <button className="o-btn small" type="submit">
            Filter
          </button>
        </form>
        <div className="o-panel flush">
          <div className="o-scroll">
            <table className="o-table">
              <thead>
                <tr>
                  <th>Signed on</th>
                  <th>Person</th>
                  <th>Company</th>
                  <th>Signed as</th>
                  <th>Document</th>
                  <th>Signature</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = DOCUMENTS[r.document as LegalDoc];
                  const current = LEGAL_DOCS.some((x) => x.id === r.document && x.version === r.version);
                  return (
                    <tr key={r.id}>
                      <td>{when(r.at)}</td>
                      <td>
                        {r.name}
                        <div className="faint" style={{ fontSize: 11 }}>{r.email}</div>
                      </td>
                      <td>{r.company ?? <span className="faint">Before joining a company</span>}</td>
                      <td>{r.role ? (ROLE[r.role] ?? r.role) : '-'}</td>
                      <td>
                        {d?.title ?? r.document}
                        <div className="faint" style={{ fontSize: 11 }}>
                          v{r.version}
                          {!current && ' (older version)'}
                        </div>
                      </td>
                      <td style={{ fontStyle: 'italic' }}>{r.signedName}</td>
                      <td className="faint" style={{ fontSize: 12 }}>{r.ip ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="o-empty">No signatures yet.</div>}
        </div>
      </div>
    </>
  );
}
