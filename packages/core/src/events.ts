import { v7 as uuidv7 } from 'uuid';

export type CompanyStage = 'sandbox' | 'pilot' | 'live';

/** SQS message body (Section 6.1). */
export interface PlatformEvent<T = unknown> {
  id: string; // UUID v7, also the outbox_events.id
  type: string; // 'approval.task_created', 'timesheet.returned', ...
  companyId: string;
  companyStage: CompanyStage;
  portal?: string; // 'timesheet'
  occurredAt: string; // ISO UTC
  requestId: string; // traces app request -> Lambda logs
  data: T;
}

/** An email the notifier should send. Templates live in workers/notifier/templates. */
export interface EmailIntent {
  to: string[];
  template: EmailTemplate;
  props: Record<string, unknown>;
}

export type EmailTemplate =
  | 'task_created'
  | 'task_reminder'
  | 'timesheet_returned'
  | 'timesheet_rejected'
  | 'timesheet_approved'
  | 'correction_requested'
  | 'ts_deadline_reminder'
  | 'export_ready';

/** Typed payloads per event type. */
export interface EventMap {
  'approval.task_created': { taskId: string; email?: EmailIntent };
  'approval.task_reminder': { taskId: string; email?: EmailIntent };
  'timesheet.submitted': { timesheetId: string };
  'timesheet.returned': { timesheetId: string; email?: EmailIntent };
  'timesheet.rejected': { timesheetId: string; email?: EmailIntent };
  'timesheet.approved': { timesheetId: string; email?: EmailIntent };
  'timesheet.correction_requested': { correctionId: string; email?: EmailIntent };
  'timesheet.deadline_reminder': { email?: EmailIntent };
  'report.export_requested': {
    exportId: string;
    report: string;
    filters: Record<string, unknown>;
    notifyEmail: string;
  };
  'report.export_ready': { exportId: string; email?: EmailIntent };
  'company.purge_requested': { reason: 'sandbox_reset' | 'promote' | 'delete' };
}

export type EventType = keyof EventMap;

export function newEvent<K extends EventType>(
  type: K,
  base: { companyId: string; companyStage: CompanyStage; portal?: string; requestId: string },
  data: EventMap[K],
): PlatformEvent<EventMap[K]> {
  return { id: uuidv7(), type, occurredAt: new Date().toISOString(), ...base, data };
}

export { uuidv7 };
