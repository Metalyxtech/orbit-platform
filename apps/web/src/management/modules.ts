import { timesheetManagement } from '@orbit/portal-timesheet/management';
import type { ManagementModule } from './types';

/**
 * Portal views for the Management workspace, by portal id. A new portal adds one line here
 * with its own module (headline + tabs); nothing else in the workspace changes.
 * Note: a portal id must not be "approvals" or "messages" (those are workspace pages).
 */
export const managementModules: Record<string, ManagementModule> = {
  timesheet: timesheetManagement,
};
