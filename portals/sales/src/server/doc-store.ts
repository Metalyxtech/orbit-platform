import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { salesCustomers, salesDocs, salesEnquiries, type Tx } from '@orbit/db';
import { notReady } from './shared';

// Read-only access to project documents. Used by enquiries.ts (enquiry page), docs.ts (uploads)
// and the web app's project documents page, so none of them has to import the others.

export interface SalesDoc {
  id: string;
  kind: 'file' | 'link';
  name: string;
  url: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  byId: string | null;
  createdAt: Date;
}

const cols = {
  id: salesDocs.id,
  kind: salesDocs.kind,
  name: salesDocs.name,
  url: salesDocs.url,
  contentType: salesDocs.contentType,
  sizeBytes: salesDocs.sizeBytes,
  byId: salesDocs.byId,
  createdAt: salesDocs.createdAt,
};
/** Links always count; files only once the upload finished. */
const visible = or(eq(salesDocs.kind, 'link'), eq(salesDocs.uploaded, true));

/** Documents of one enquiry. */
export async function listDocs(tx: Tx, companyId: string, enquiryId: string): Promise<SalesDoc[]> {
  const rows = await tx.select(cols).from(salesDocs).where(and(eq(salesDocs.companyId, companyId), eq(salesDocs.enquiryId, enquiryId), visible)).orderBy(asc(salesDocs.createdAt));
  return rows as SalesDoc[];
}

/** One uploaded file of this company, for the download link. */
export async function docFile(tx: Tx, companyId: string, id: string) {
  const [f] = await tx
    .select({ s3Key: salesDocs.s3Key, name: salesDocs.name })
    .from(salesDocs)
    .where(and(eq(salesDocs.id, id), eq(salesDocs.companyId, companyId), eq(salesDocs.kind, 'file'), eq(salesDocs.uploaded, true)));
  return f?.s3Key ? f : null;
}

export interface ProjectDocs {
  enquiryId: string;
  number: string;
  title: string;
  customer: string;
  stage: string;
  pricingDone: boolean;
  docs: SalesDoc[];
}

/**
 * Every project that has documents, newest first, for people in other portals (engineering,
 * purchase, planning). Empty before migration 0019 or when the company has no Sales data.
 */
export async function projectDocuments(tx: Tx, companyId: string): Promise<ProjectDocs[]> {
  try {
    return await tx.transaction(async (sp) => {
      const docs = (await sp.select({ ...cols, enquiryId: salesDocs.enquiryId }).from(salesDocs).where(and(eq(salesDocs.companyId, companyId), visible)).orderBy(asc(salesDocs.createdAt))) as (SalesDoc & { enquiryId: string })[];
      const ids = [...new Set(docs.map((d) => d.enquiryId))];
      if (!ids.length) return [];
      const enq = await sp
        .select({ id: salesEnquiries.id, number: salesEnquiries.number, title: salesEnquiries.title, stage: salesEnquiries.stage, pricingDoneAt: salesEnquiries.pricingDoneAt, customer: salesCustomers.name })
        .from(salesEnquiries)
        .innerJoin(salesCustomers, eq(salesCustomers.id, salesEnquiries.customerId))
        .where(and(eq(salesEnquiries.companyId, companyId), inArray(salesEnquiries.id, ids)))
        .orderBy(desc(salesEnquiries.createdAt));
      return enq.map((e) => ({
        enquiryId: e.id,
        number: e.number,
        title: e.title,
        customer: e.customer,
        stage: e.stage,
        pricingDone: !!e.pricingDoneAt,
        docs: docs.filter((d) => d.enquiryId === e.id).map(({ enquiryId: _e, ...d }) => d),
      }));
    });
  } catch (err) {
    if (notReady(err)) return [];
    throw err;
  }
}
