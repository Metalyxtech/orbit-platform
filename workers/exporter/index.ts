import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { newEvent, type EventMap, type PlatformEvent, type SessionContext } from '@orbit/core';
import {
  companies,
  costCodes,
  exports as exportsTable,
  memberships,
  projects,
  timesheetEntries,
  timesheets,
  users,
} from '@orbit/db';
import { reports } from '@orbit/portal-timesheet/server';
import { alreadyProcessed, markProcessed, workerDb } from '../shared/db';
import { log } from '../shared/log';

const s3 = new S3Client({});
const sqs = new SQSClient({});

type ExportEvent = PlatformEvent<EventMap['report.export_requested']>;

/** Builds the workbook from the same query as the Reports screen (acceptance test T3). */
export async function buildWorkbook(event: ExportEvent) {
  const db = await workerDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, event.companyId));
  const month = String(event.data.filters.month);
  const projectIds = (event.data.filters.projectIds as string[] | undefined) ?? [];
  // The app already limited projectIds to what the requester may see.
  const ctx = { companyId: event.companyId, role: 'company_admin', membershipId: '', timezone: company.timezone } as SessionContext;
  const byProject = await reports.hoursByProject(db, ctx, { month, projectIds });

  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const detail = projectIds.length
    ? await db
        .select({
          date: timesheetEntries.workDate,
          employee: users.name,
          project: projects.code,
          projectName: projects.name,
          costCode: costCodes.code,
          hours: timesheetEntries.hours,
        })
        .from(timesheetEntries)
        .innerJoin(timesheets, eq(timesheets.id, timesheetEntries.timesheetId))
        .innerJoin(memberships, eq(memberships.id, timesheets.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .leftJoin(projects, eq(projects.id, timesheetEntries.projectId))
        .leftJoin(costCodes, eq(costCodes.id, timesheetEntries.costCodeId))
        .where(
          and(
            eq(timesheetEntries.companyId, event.companyId),
            eq(timesheets.status, 'locked'),
            gte(timesheetEntries.workDate, start),
            lt(timesheetEntries.workDate, end),
            inArray(timesheetEntries.projectId, projectIds),
          ),
        )
        .orderBy(asc(timesheetEntries.workDate), asc(users.name))
    : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Orbit';
  const summary = wb.addWorksheet('Hours by project');
  summary.columns = [
    { header: 'Project', key: 'label', width: 40 },
    { header: 'Regular hours', key: 'regular', width: 16, style: { numFmt: '0.00' } },
    { header: 'Overtime hours', key: 'overtime', width: 16, style: { numFmt: '0.00' } },
    { header: 'Total hours', key: 'hours', width: 16, style: { numFmt: '0.00' } },
  ];
  byProject.forEach((p) => summary.addRow(p));
  summary.addRow({
    label: 'Total',
    regular: byProject.reduce((s, p) => s + p.regular, 0),
    overtime: byProject.reduce((s, p) => s + p.overtime, 0),
    hours: byProject.reduce((s, p) => s + p.hours, 0),
  }).font = { bold: true };
  summary.getRow(1).font = { bold: true };

  const sheet = wb.addWorksheet('Approved entries');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Employee', key: 'employee', width: 24 },
    { header: 'Project', key: 'project', width: 14 },
    { header: 'Project name', key: 'projectName', width: 30 },
    { header: 'Cost code', key: 'costCode', width: 12 },
    { header: 'Hours', key: 'hours', width: 10, style: { numFmt: '0.00' } },
  ];
  detail.forEach((d) => sheet.addRow(d));
  sheet.getRow(1).font = { bold: true };

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), byProject };
}

async function run(event: ExportEvent) {
  const db = await workerDb();
  const { buffer } = await buildWorkbook(event);
  const key = `${event.companyId}/timesheet/exports/${event.data.exportId}.xlsx`;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      Tagging: 'retention=export', // lifecycle: delete after 7 days
    }),
  );
  await db.update(exportsTable).set({ status: 'ready', s3Key: key }).where(eq(exportsTable.id, event.data.exportId));

  // The link goes through the app, which checks the session and the 24 h window, then
  // redirects to a fresh pre-signed URL (a Lambda-signed URL would not live 24 h).
  const ready = newEvent(
    'report.export_ready',
    { companyId: event.companyId, companyStage: event.companyStage, portal: 'timesheet', requestId: event.requestId },
    {
      exportId: event.data.exportId,
      email: {
        to: [event.data.notifyEmail],
        template: 'export_ready',
        props: { baseUrl: process.env.APP_BASE_URL, path: `/api/exports/${event.data.exportId}` },
      },
    },
  );
  await sqs.send(new SendMessageCommand({ QueueUrl: process.env.EVENTS_QUEUE_URL, MessageBody: JSON.stringify(ready) }));
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    const body = JSON.parse(record.body) as ExportEvent;
    try {
      if (body.type !== 'report.export_requested' || (await alreadyProcessed(body.id))) continue;
      await run(body);
      await markProcessed(body.id, 'exporter');
      log('info', 'export ready', { exportId: body.data.exportId, requestId: body.requestId });
    } catch (err) {
      log('error', 'export failed', { id: body.id, error: String(err) });
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
