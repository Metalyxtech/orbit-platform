import type { ComponentType } from 'react';
import type { TimesheetFormId } from '../../forms';
import type { WeekView } from '../../server/week';
import { DailyLogForm } from './DailyLogForm';
import { DailyLogPreview, WeeklyGridPreview } from './previews';
import { WeekGridForm } from './WeekGridForm';

type FormProps = { view: WeekView; draftKey: string };

/** Form id -> the My week component and its preview. Names and texts live in src/forms.ts. */
export const formComponents: Record<TimesheetFormId, { Form: ComponentType<FormProps>; Preview: ComponentType }> = {
  'weekly-grid': { Form: WeekGridForm, Preview: WeeklyGridPreview },
  'daily-log': { Form: DailyLogForm, Preview: DailyLogPreview },
};
