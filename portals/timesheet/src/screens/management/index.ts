import { ApprovalsView } from './Approvals';
import { TimesheetHeadline } from './Headline';
import { TimesheetOverview } from './Overview';
import { PeopleView } from './People';
import { ProjectsView } from './Projects';
import { SummaryView } from './Summary';

/**
 * Timesheet inside the Management workspace: one sidebar entry, these tabs inside it.
 * Add, remove or reorder a tab here; each tab is its own file.
 */
export const timesheetManagement = {
  headline: TimesheetHeadline,
  overview: TimesheetOverview,
  tabs: [
    { id: 'dashboard', label: 'Dashboard', View: TimesheetOverview },
    { id: 'summary', label: 'Summary', View: SummaryView },
    { id: 'people', label: 'Hours by person', View: PeopleView },
    { id: 'approvals', label: 'Approvals waiting', View: ApprovalsView },
    { id: 'projects', label: 'Projects', View: ProjectsView },
  ],
  /** Full pages inside the Timesheet portal itself. */
  links: [
    { label: 'Reports', path: 'reports' },
    { label: 'Team', path: 'team' },
    { label: 'Approvals', path: 'approvals' },
  ],
};
