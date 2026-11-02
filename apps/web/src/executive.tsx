import type { ComponentType } from 'react';
import { TimesheetExecutive } from '@orbit/portal-timesheet/executive';

/**
 * Management workspace sections, one per portal. A new portal adds one line here with its own
 * section component; nothing else in the workspace changes.
 */
export const executiveSections: Record<string, ComponentType> = {
  timesheet: TimesheetExecutive,
};
