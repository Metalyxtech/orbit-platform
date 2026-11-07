import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { activateApprovedPlan } from './quotes';
import { companyKey, presignUpload } from '@orbit/core/aws';
import { customRequestFiles, customRequests, type Tx } from '@orbit/db';

// Custom requirements: any company admin describes the custom portal or change they need and
// uploads their forms; Super Admin reviews, replies and sets the price. Nothing here touches the
// normal portals.

export const AREAS = [
  { id: 'timesheet', label: 'Timesheet (change or new form)' },
  { id: 'procurement', label: 'Purchase (change or new form)' },
  { id: 'new', label: 'A new custom portal' },
  { id: 'other', label: 'Something else (report, workflow, integration)' },
] as const;
export const STATUSES = [
  { id: 'new', label: 'Sent to Orbit', tone: 'steel' },
  { id: 'reviewing', label: 'Orbit is reviewing', tone: 'warn' },
  { id: 'quoted', label: 'Price sent: waiting for approval', tone: 'hivis' },
  { id: 'approved', label: 'Approved: work starting', tone: 'ok' },
  { id: 'in_progress', label: 'Being built', tone: 'warn' },
  { id: 'ready', label: 'Ready', tone: 'ok' },
  { id: 'declined', label: 'Not possible', tone: 'bad' },
] as const;
export type RequestStatus = (typeof STATUSES)[number]['id'];
export const statusOf = (s: string) => STATUSES.find((x) => x.id === s) ?? STATUSES[0];
export const areaLabel = (a: string) => AREAS.find((x) => x.id === a)?.label ?? a;

/** Any company admin can ask for a custom portal or changes; Orbit then sets the price. */
const requireCustomAdmin = async (_tx: Tx, ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can send custom requirements');
};

const createInput = z.object({
  title: z.string().trim().min(3, 'Give the request a short title').max(160),
  details: z.string().trim().min(10, 'Describe what you need in a few words').max(8000),
  area: z.enum(AREAS.map((a) => a.id) as [string, ...string[]]),
});

/** Company admin sends a new requirement. Files are added next, one by one. */
export async function createRequest(tx: Tx, ctx: ActionContext, raw: z.input<typeof createInput>) {
  await requireCustomAdmin(tx, ctx);
  const v = createInput.parse(raw);
  const [row] = await tx
    .insert(customRequests)
    .values({ companyId: ctx.companyId, requestedBy: ctx.membershipId, requestedName: ctx.name, title: v.title, details: v.details, area: v.area })
    .returning({ id: customRequests.id });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'custom.request', entity: 'custom_requests', entityId: row.id, data: { summary: [`Custom requirement sent: ${v.title}`] }, requestId: ctx.requestId });
  return { id: row.id };
}

const MAX_FILES = 20;
const fileInput = z.object({
  requestId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().max(120),
  size: z.number().int().positive(),
});

/** Reserves a file on the request and returns a 5-minute upload link (the browser sends the file to S3). */
export async function startFileUpload(tx: Tx, ctx: ActionContext, raw: z.input<typeof fileInput>) {
  await requireCustomAdmin(tx, ctx);
  const v = fileInput.parse(raw);
  const [req] = await tx.select({ id: customRequests.id }).from(customRequests).where(and(eq(customRequests.id, v.requestId), eq(customRequests.companyId, ctx.companyId)));
  if (!req) throw new Error('Request not found');
  const count = await tx.select({ id: customRequestFiles.id }).from(customRequestFiles).where(eq(customRequestFiles.requestId, v.requestId));
  if (count.length >= MAX_FILES) throw new Error(`Up to ${MAX_FILES} files per request`);
  const safe = v.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
  const [file] = await tx
    .insert(customRequestFiles)
    .values({ requestId: v.requestId, companyId: ctx.companyId, s3Key: 'pending', fileName: v.fileName, contentType: v.contentType, sizeBytes: v.size })
    .returning({ id: customRequestFiles.id });
  const key = companyKey(ctx.companyId, 'custom', v.requestId, `${file.id}-${safe}`);
  const url = await presignUpload(key, v.contentType, v.size); // checks type and the 10 MB limit
  await tx.update(customRequestFiles).set({ s3Key: key }).where(eq(customRequestFiles.id, file.id));
  return { fileId: file.id, url };
}

/** The browser finished the upload. */
export async function confirmFileUpload(tx: Tx, ctx: ActionContext, raw: { fileId: string }) {
  await requireCustomAdmin(tx, ctx);
  const fileId = z.uuid().parse(raw.fileId);
  await tx.update(customRequestFiles).set({ uploaded: true }).where(and(eq(customRequestFiles.id, fileId), eq(customRequestFiles.companyId, ctx.companyId)));
  return { ok: true as const };
}

/** One company's requests with their uploaded files, newest first (company admin and Super Admin). */
export async function companyRequests(tx: Tx, companyId: string) {
  const rows = await tx.select().from(customRequests).where(eq(customRequests.companyId, companyId)).orderBy(desc(customRequests.createdAt));
  const files = rows.length
    ? await tx
        .select()
        .from(customRequestFiles)
        .where(and(inArray(customRequestFiles.requestId, rows.map((r) => r.id)), eq(customRequestFiles.uploaded, true)))
    : [];
  return rows.map((r) => ({ ...r, files: files.filter((f) => f.requestId === r.id) }));
}
export type CustomRequest = Awaited<ReturnType<typeof companyRequests>>[number];

const updateInput = z.object({
  id: z.uuid(),
  status: z.enum(STATUSES.map((s) => s.id) as [RequestStatus, ...RequestStatus[]]),
  orbitNote: z.string().trim().max(4000).optional(),
});

/** Super Admin moves a request along and replies to the customer. */
export async function updateRequest(tx: Tx, companyId: string, raw: z.input<typeof updateInput>) {
  const v = updateInput.parse(raw);
  const [row] = await tx
    .update(customRequests)
    .set({ status: v.status, orbitNote: v.orbitNote || null, updatedAt: new Date() })
    .where(and(eq(customRequests.id, v.id), eq(customRequests.companyId, companyId)))
    .returning({ title: customRequests.title });
  if (!row) throw new Error('Request not found');
  // Ready: an approved price becomes the company's custom plan, so the admin can subscribe.
  if (v.status === 'ready') await activateApprovedPlan(tx, companyId, v.id); // only a price the customer approved
  await audit(tx, { companyId, actorId: null, action: 'custom.update', entity: 'custom_requests', entityId: v.id, data: { summary: [`Custom requirement "${row.title}": ${statusOf(v.status).label}`] } });
}

/** One uploaded file of this company (for the download link). */
export async function requestFile(tx: Tx, companyId: string, fileId: string) {
  const [f] = await tx
    .select()
    .from(customRequestFiles)
    .where(and(eq(customRequestFiles.id, fileId), eq(customRequestFiles.companyId, companyId), eq(customRequestFiles.uploaded, true)));
  return f ?? null;
}

/** Sign-up with "a custom portal built for us": the company's first request, waiting for Orbit. */
export async function requestFromSignUp(tx: Tx, v: { companyId: string; membershipId: string; name: string; details: string }) {
  await tx.insert(customRequests).values({
    companyId: v.companyId,
    requestedBy: v.membershipId,
    requestedName: v.name,
    title: 'Custom portal (asked at sign-up)',
    details: v.details.trim().slice(0, 8000) || 'Asked for a custom portal when registering. Forms to follow.',
    area: 'new',
  });
}

/** Does this company have any custom request (used when approving a custom-only sign-up)? */
export async function hasCustomRequest(tx: Tx, companyId: string) {
  const [r] = await tx.select({ id: customRequests.id }).from(customRequests).where(eq(customRequests.companyId, companyId)).limit(1);
  return !!r;
}
