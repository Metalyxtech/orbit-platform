import Link from 'next/link';
import { query } from '@orbit/core/next';
import { Chip, EmptyState, TopBar } from '@orbit/ui';
import { stageLabel } from '@orbit/portal-sales/config';
import { projectDocuments } from '@orbit/portal-sales/server';
import { accessiblePortals } from '@/portal-access';
import { projectDocsOn } from '@/project-docs';
import { DocList } from '@orbit/portal-sales/docs';

export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Project documents from Sales enquiries, for everyone in the company (estimating, engineering, purchase). */
export default async function ProjectDocsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = (one((await searchParams).q) ?? '').toLowerCase();
  const d = await query(async (tx, ctx) => {
    if (!(await projectDocsOn(tx, ctx))) return null;
    return { projects: await projectDocuments(tx, ctx.companyId), sales: (await accessiblePortals(tx, ctx)).includes('sales') };
  });
  if (!d)
    return (
      <div className="o-page">
        <EmptyState title="Project documents come from the Sales portal, which is not on for your company." />
      </div>
    );
  const rows = q ? d.projects.filter((p) => `${p.number} ${p.title} ${p.customer}`.toLowerCase().includes(q)) : d.projects;
  return (
    <>
      <TopBar crumbs={['Project documents']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Project documents</h1>
            <p>Drawings, specifications and links sales collected from customers, by enquiry.</p>
          </div>
          <form className="o-row" style={{ gap: 6 }}>
            <input className="o-input" name="q" defaultValue={q} placeholder="Search enquiry, customer" style={{ width: 240 }} aria-label="Search" />
          </form>
        </div>
        {rows.length === 0 && <EmptyState title={d.projects.length ? 'No projects match.' : 'No project documents yet.'} />}
        {rows.map((p) => (
          <div key={p.enquiryId} className="o-panel">
            <div className="o-panel-head">
              <h2 style={{ fontSize: 15 }}>
                {d.sales ? <Link href={`/sales/enquiry?id=${p.enquiryId}`}>{p.number}</Link> : p.number} {p.title}
                <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {p.customer}</span>
              </h2>
              <span className="o-row" style={{ gap: 6 }}>
                <Chip tone="grey">{stageLabel(p.stage)}</Chip>
                {p.pricingDone && <Chip tone="ok">Pricing done</Chip>}
              </span>
            </div>
            <DocList docs={p.docs.map((x) => ({ ...x, by: '' }))} />
          </div>
        ))}
      </div>
    </>
  );
}
