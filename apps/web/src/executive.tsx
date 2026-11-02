import type { ComponentType } from 'react';
import { TimesheetExecutive } from '@orbit/portal-timesheet/executive';

/**
 * Management workspace sections, one per portal. A new portal adds one line here with its own
 * section component; nothing else in the workspace changes.
 */
/** Each section gets the page's search params (for example ?period=week). */
export type ExecutiveSectionProps = { params?: Record<string, string | undefined> };

export const executiveSections: Record<string, ComponentType<ExecutiveSectionProps>> = {
  timesheet: TimesheetExecutive,
};
