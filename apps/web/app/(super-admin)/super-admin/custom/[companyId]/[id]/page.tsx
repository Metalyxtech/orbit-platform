import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { areaLabel, STATUSES, statusOf } from '@/custom/requests';
import { updateCustomRequestAction } from '../../../custom-actions';
import { companyCustomWork } from '../../../custom-data';
import { fmtDate, loadCompanies, requireSuperAdminPage } from '../../../data';

export const dynamic = 'force-dynamic';

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Super Admin > Custom work > one requirement: details, the customer's files, status and reply. */
export default async function CustomRequestPage({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const me = await requireSuperAdminPage();
  const p = await params;
  const companyId = z.uuid().safeParse(p.companyId);
  const id = z.uuid().safeParse(p.id);
  if (!companyId.success || !id.success) notFound();
  const company = (await loadCompanies()).find((c) => c.id === companyId.data);
  if (!company) notFound();
  const work = await companyCustomWork(company.id, me.userId);
  const r = work.requests.find((x) => x.id === id.data);
  if (!r) notFound();
  const fileUrl = (fileId: string) => `/api/custom-files/${fileId}?c=${company.id}`;
  return (
    <>
      <header className="o-top">
        <span className="faint">
          <Link href="/super-admin/custom">Custom work</Link> /
        </span>
        <strong>{r.title}</strong>
      </header>
      <div className="o-page">
        <div className="o-split">
          <div className="o-stack" style={{ gap: 16 }}>
            <div className="o-panel">
              <div className="o-row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>{r.title}</h2>
                <span className={`o-chip ${statusOf(r.status).tone}`}>{statusOf(r.status).label}</span>
              </div>
              <p className="faint" style={{ fontSize: 12 }}>
                <Link href={`/super-admin/companies/${company.id}`}>{company.name}</Link> · {areaLabel(r.area)} · sent {fmtDate(r.createdAt)} by {r.requestedName}
              </p>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{r.details}</p>
            </div>
            <div className="o-panel">
              <div className="o-panel-head">
                <h2>Their files ({r.files.length})</h2>
              </div>
              {r.files.length === 0 && <p className="faint">No files attached.</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {r.files.map((f) => (
                  <div key={f.id} style={{ border: '1px solid var(--line)', borderRadius: 4, padding: 8 }}>
                    {f.contentType.startsWith('image/') ? (
                      <a href={fileUrl(f.id)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileUrl(f.id)} alt={f.fileName} style={{ width: '100%', height: 160, objectFit: 'contain', background: '#f5f6f7' }} />
                      </a>
                    ) : (
                      <div style={{ height: 160, display: 'grid', placeItems: 'center', background: '#f5f6f7', fontSize: 28 }}>
                        {f.contentType === 'application/pdf' ? 'PDF' : 'FILE'}
                      </div>
                    )}
                    <div style={{ fontSize: 12, marginTop: 6, wordBreak: 'break-all' }}>{f.fileName}</div>
                    <div className="o-row" style={{ justifyContent: 'space-between', fontSize: 11 }}>
                      <span className="faint">{kb(f.sizeBytes)}</span>
                      <a href={fileUrl(f.id)} target="_blank" rel="noreferrer">
                        Open / download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="o-panel">
            <div className="o-panel-head">
              <h2>Status and reply</h2>
            </div>
            <form action={updateCustomRequestAction.bind(null, company.id, r.id)} className="o-stack" style={{ gap: 10 }}>
              <label className="o-field">
                Status
                <select className="o-select" name="status" defaultValue={r.status}>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="o-field">
                Reply to the customer (they see it on their Custom requirements page)
                <textarea className="o-input" name="orbitNote" rows={6} maxLength={4000} defaultValue={r.orbitNote ?? ''} placeholder="e.g. We will build this as a new form in your custom portal. Ready in about 2 weeks." />
              </label>
              <button className="o-btn small primary" type="submit" style={{ alignSelf: 'flex-start' }}>
                Save
              </button>
            </form>
            <p className="faint" style={{ fontSize: 12 }}>
              Price for this customer: Company page › Custom work{work.plan?.monthlyPrice || work.plan?.yearlyPrice ? '' : ' (not set yet)'}.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
