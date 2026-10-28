import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { and, eq, ne } from 'drizzle-orm';
import type { EventMap, PlatformEvent } from '@orbit/core/events';
import {
  auditLog,
  companies,
  companyPortals,
  correctionRequests,
  costCodes,
  exports as exportsTable,
  memberships,
  outboxEvents,
  projectMembers,
  projects,
  timesheetEntries,
  timesheets,
  tsSettings,
  workflowInstances,
  workflowTasks,
} from '@orbit/db';
import { alreadyProcessed, markProcessed, workerDb } from '../shared/db';
import { log } from '../shared/log';

const s3 = new S3Client({});

async function purgeS3Prefix(companyId: string) {
  let token: string | undefined;
  let deleted = 0;
  do {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: process.env.BUCKET, Prefix: `${companyId}/`, ContinuationToken: token }),
    );
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: process.env.BUCKET, Delete: { Objects: keys, Quiet: true } }));
      deleted += keys.length;
    }
    token = list.NextContinuationToken;
  } while (token);
  return deleted;
}

/**
 * Deletes one company's transactional rows and S3 prefix (sandbox reset or promote).
 * 'delete' also removes setup data, memberships and the company itself.
 */
async function purge(event: PlatformEvent<EventMap['company.purge_requested']>) {
  const db = await workerDb();
  const c = event.companyId;
  // Children before parents (foreign keys).
  await db.delete(timesheetEntries).where(eq(timesheetEntries.companyId, c));
  await db.delete(correctionRequests).where(eq(correctionRequests.companyId, c));
  await db.delete(workflowTasks).where(eq(workflowTasks.companyId, c));
  await db.delete(workflowInstances).where(eq(workflowInstances.companyId, c));
  await db.delete(timesheets).where(eq(timesheets.companyId, c));
  await db.delete(exportsTable).where(eq(exportsTable.companyId, c));
  await db.delete(outboxEvents).where(and(eq(outboxEvents.companyId, c), ne(outboxEvents.id, event.id)));
  const files = await purgeS3Prefix(c);

  if (event.data.reason === 'delete') {
    await db.delete(costCodes).where(eq(costCodes.companyId, c));
    await db.delete(projectMembers).where(eq(projectMembers.companyId, c));
    await db.delete(projects).where(eq(projects.companyId, c));
    await db.delete(tsSettings).where(eq(tsSettings.companyId, c));
    await db.delete(companyPortals).where(eq(companyPortals.companyId, c));
    await db.delete(auditLog).where(eq(auditLog.companyId, c));
    await db.delete(outboxEvents).where(eq(outboxEvents.companyId, c));
    await db.delete(memberships).where(eq(memberships.companyId, c));
    await db.delete(companies).where(eq(companies.id, c));
  } else {
    await db.insert(auditLog).values({
      companyId: c,
      action: `company.purge.${event.data.reason}`,
      entity: 'companies',
      entityId: c,
      data: { files },
      requestId: event.requestId,
    });
  }
  return files;
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    const body = JSON.parse(record.body) as PlatformEvent<EventMap['company.purge_requested']>;
    try {
      if (body.type !== 'company.purge_requested' || (await alreadyProcessed(body.id))) continue;
      const files = await purge(body);
      if (body.data.reason !== 'delete') await markProcessed(body.id, 'company-purge');
      log('info', 'company purged', { companyId: body.companyId, reason: body.data.reason, files, requestId: body.requestId });
    } catch (err) {
      log('error', 'purge failed', { id: body.id, error: String(err) });
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
