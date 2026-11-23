'use client';
import type { WeekRow } from '../../server/week';
import type { WeekEditor } from './useWeekEditor';

/** Project and cost code pickers for one row (read-only labels when the week is locked). */
export function RowPickers({ e, r, onPick }: { e: WeekEditor; r: WeekRow; onPick: (patch: Pick<WeekRow, 'projectId' | 'costCodeId'>) => void }) {
  if (e.readOnly)
    return (
      <>
        <strong>{r.projectLabel || 'No project'}</strong>
        <span>{r.costCodeLabel || 'No cost code'}</span>
      </>
    );
  return (
    <>
      <select aria-label="Project" value={r.projectId ?? ''} onChange={(ev) => onPick({ projectId: ev.target.value || null, costCodeId: null })}>
        <option value="">Choose project</option>
        {e.options.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} {p.name}
          </option>
        ))}
      </select>
      <select aria-label="Cost code" value={r.costCodeId ?? ''} onChange={(ev) => onPick({ projectId: r.projectId, costCodeId: ev.target.value || null })}>
        <option value="">Choose cost code</option>
        {e.projectCodes(r.projectId).map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} {c.name}
          </option>
        ))}
      </select>
    </>
  );
}
