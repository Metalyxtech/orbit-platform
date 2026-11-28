'use client';
import type { WeekRow } from '../../server/week';
import { useTs } from '../useTs';
import type { WeekEditor } from './useWeekEditor';

/** Project and cost code pickers for one row (read-only labels when the week is locked). */
export function RowPickers({ e, r, onPick }: { e: WeekEditor; r: WeekRow; onPick: (patch: Pick<WeekRow, 'projectId' | 'costCodeId'>) => void }) {
  const { t } = useTs();
  if (e.readOnly)
    return (
      <>
        <strong>{r.projectLabel || t('noProject')}</strong>
        <span>{r.costCodeLabel || t('noCostCode')}</span>
      </>
    );
  return (
    <>
      <select aria-label={t('project')} value={r.projectId ?? ''} onChange={(ev) => onPick({ projectId: ev.target.value || null, costCodeId: null })}>
        <option value="">{t('chooseProject')}</option>
        {e.options.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} {p.name}
          </option>
        ))}
      </select>
      <select aria-label={t('costCode')} value={r.costCodeId ?? ''} onChange={(ev) => onPick({ projectId: r.projectId, costCodeId: ev.target.value || null })}>
        <option value="">{t('chooseCostCode')}</option>
        {e.projectCodes(r.projectId).map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} {c.name}
          </option>
        ))}
      </select>
    </>
  );
}
