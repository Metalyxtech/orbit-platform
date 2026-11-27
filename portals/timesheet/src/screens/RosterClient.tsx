'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog, EmptyState, TopBar, useToast } from '@orbit/ui';
import { copyRosterWeekAction, publishRosterAction, setRosterCellsAction } from '../actions';
import type { RosterView } from '../server';

type Kind = 'shift' | 'off' | 'leave';
type Pick = { membershipId: string; name: string; day: number };
type Scope = 'day' | 'week' | 'everyone';

/**
 * Team > Roster: people down the side, the week across. Click a day to set a shift, a day off or
 * leave, with overtime planned in advance. Changes are a draft (dotted) until the week is published.
 */
export function RosterClient({ view }: { view: RosterView }) {
  const router = useRouter();
  const toast = useToast();
  const [pick, setPick] = useState<Pick | null>(null);
  const [kind, setKind] = useState<Kind | null>('shift');
  const [shiftId, setShiftId] = useState<string | null>(view.shifts[0]?.id ?? null);
  const [plannedOt, setPlannedOt] = useState(0);
  const [note, setNote] = useState('');
  const [scope, setScope] = useState<Scope>('day');
  const [busy, setBusy] = useState(false);
  const shiftOf = (id: string | null) => view.shifts.find((s) => s.id === id);

  function open(p: Pick) {
    const c = view.people.find((x) => x.membershipId === p.membershipId)?.cells[p.day];
    setPick(p);
    setKind(c?.kind ?? 'shift');
    setShiftId(c?.shiftId ?? view.shifts[0]?.id ?? null);
    setPlannedOt(c?.plannedOt ?? 0);
    setNote(c?.note ?? '');
    setScope('day');
  }

  async function run<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: (d: T) => string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(done(res.data));
    router.refresh();
  }

  function save(clear = false) {
    if (!pick) return;
    const targets =
      scope === 'week'
        ? view.days.map((d) => ({ membershipId: pick.membershipId, date: d.date }))
        : scope === 'everyone'
          ? view.people.map((p) => ({ membershipId: p.membershipId, date: view.days[pick.day].date }))
          : [{ membershipId: pick.membershipId, date: view.days[pick.day].date }];
    const cells = targets.map((t) => ({ ...t, kind: clear ? null : kind, shiftId: kind === 'shift' ? shiftId : null, plannedOt, note: note || null }));
    setPick(null);
    void run(() => setRosterCellsAction({ cells }), (d) => `${d.changed} ${d.changed === 1 ? 'day' : 'days'} updated. Publish the week when you are ready.`);
  }

  const cellText = (c: RosterView['people'][number]['cells'][number]) => {
    if (!c) return { title: '+', sub: '' };
    if (c.kind === 'shift') {
      const s = shiftOf(c.shiftId);
      return { title: s?.name ?? 'Shift', sub: s ? `${s.startTime}-${s.endTime}` : '' };
    }
    return { title: c.kind === 'off' ? 'Day off' : 'Leave', sub: '' };
  };

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Team', 'Roster']}>
        <Link className="o-btn small" href={`?week=${view.prevWeek}`}>
          Previous
        </Link>
        <span className="o-btn small" style={{ cursor: 'default' }}>
          <strong>{view.rangeLabel}</strong>
        </span>
        <Link className="o-btn small" href={`?week=${view.nextWeek}`}>
          Next
        </Link>
      </TopBar>
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Roster</h1>
            <p>
              {view.canEdit
                ? 'Plan each person’s shifts and any overtime you approve in advance. People see their roster once you publish the week.'
                : 'Every team’s roster, view only.'}
            </p>
          </div>
          {view.canEdit && view.people.length > 0 && (
            <div className="o-row">
              <Button disabled={busy} onClick={() => void run(() => copyRosterWeekAction({ weekStart: view.weekStart }), (d) => (d.copied ? `Copied ${d.copied} days from last week as a draft.` : 'Last week had nothing to copy.'))}>
                Copy last week
              </Button>
              <Button variant="primary" disabled={busy || view.unpublished === 0} onClick={() => void run(() => publishRosterAction({ weekStart: view.weekStart }), (d) => `Published: ${d.published} days are now visible to your team.`)}>
                {view.unpublished ? `Publish week (${view.unpublished} ${view.unpublished === 1 ? 'change' : 'changes'})` : 'Published'}
              </Button>
            </div>
          )}
        </div>

        {view.canEdit && view.shifts.length === 0 && (
          <div className="o-banner hivis">No shifts are set up yet. The company admin adds them in Timesheet settings, Shifts and holidays.</div>
        )}
        {view.unpublished > 0 && view.canEdit && <div className="o-banner">Days with a dotted border are not published yet: your team does not see them.</div>}

        {view.people.length === 0 ? (
          <EmptyState title="Nobody to roster yet.">
            <p className="muted" style={{ margin: 0 }}>People you supervise, or who are on your projects, appear here.</p>
          </EmptyState>
        ) : (
          <div className="o-panel flush">
            <div className="o-scroll">
              <table className="ts-roster-grid">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    {view.days.map((d) => (
                      <th key={d.date} scope="col">
                        {d.name} {d.label}
                        {d.holiday && <div className="faint" style={{ fontWeight: 400 }}>{d.holiday}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.people.map((p) => (
                    <tr key={p.membershipId}>
                      <td className="person">
                        <strong>{p.name}</strong>
                        {p.title && <div className="faint">{p.title}</div>}
                      </td>
                      {p.cells.map((c, i) => {
                        const t = cellText(c);
                        const s = c?.kind === 'shift' ? shiftOf(c.shiftId) : undefined;
                        const cls = ['ts-cell', c ? 'set' : '', c && c.kind !== 'shift' ? 'off' : '', c && !c.published ? 'draft' : '', view.days[i].holiday ? 'holiday' : ''].filter(Boolean).join(' ');
                        return (
                          <td key={i}>
                            <button
                              type="button"
                              className={cls}
                              style={s ? { borderLeftColor: s.color } : undefined}
                              disabled={!view.canEdit}
                              onClick={() => open({ membershipId: p.membershipId, name: p.name, day: i })}
                              aria-label={`${p.name}, ${view.days[i].name} ${view.days[i].label}: ${c ? t.title : 'not rostered'}`}
                            >
                              <strong>{t.title}</strong>
                              {t.sub && <span className="muted">{t.sub}</span>}
                              {c && c.plannedOt > 0 && <span className="hivis">+{c.plannedOt} h OT</span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view.shifts.length > 0 && (
          <div className="o-row" style={{ gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            {view.shifts.map((s) => (
              <span key={s.id} className="o-row" style={{ gap: 6 }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
                {s.name} {s.startTime}-{s.endTime} ({s.hours} h)
              </span>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pick}
        title={pick ? `${pick.name}, ${view.days[pick.day].name} ${view.days[pick.day].label}` : ''}
        confirmLabel="Save as draft"
        confirmDisabled={busy || (kind === 'shift' && !shiftId)}
        onConfirm={() => save()}
        onCancel={() => setPick(null)}
      >
        <div className="o-stack" style={{ gap: 12 }}>
          <div className="o-row" style={{ gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Plan for the day">
            {view.shifts.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={kind === 'shift' && shiftId === s.id}
                className={`o-btn small${kind === 'shift' && shiftId === s.id ? ' primary' : ''}`}
                onClick={() => {
                  setKind('shift');
                  setShiftId(s.id);
                }}
              >
                {s.name} {s.startTime}-{s.endTime}
              </button>
            ))}
            {(['off', 'leave'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={`o-btn small${kind === k ? ' primary' : ''}`} onClick={() => setKind(k)}>
                {k === 'off' ? 'Day off' : 'Leave'}
              </button>
            ))}
          </div>
          {kind !== 'leave' && (
            <label className="o-field" style={{ margin: 0 }}>
              Overtime approved in advance (hours)
              <input className="o-input" type="number" min={0} max={16} step={0.5} value={plannedOt} onChange={(e) => setPlannedOt(Math.max(0, Math.min(16, Number(e.target.value) || 0)))} style={{ maxWidth: 120 }} />
            </label>
          )}
          <label className="o-field" style={{ margin: 0 }}>
            Note (optional)
            <input className="o-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Site B, crane lift" />
          </label>
          <fieldset className="o-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Apply to</legend>
            <div className="o-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(
                [
                  ['day', 'This day'],
                  ['week', `${pick?.name ?? ''}'s whole week`],
                  ['everyone', 'Everyone on this day'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" className={`o-btn small${scope === v ? ' primary' : ''}`} aria-pressed={scope === v} onClick={() => setScope(v)}>
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
          <Button size="small" variant="danger" disabled={busy} onClick={() => save(true)}>
            Clear {scope === 'day' ? 'this day' : scope === 'week' ? 'the week' : 'this day for everyone'}
          </Button>
        </div>
      </ConfirmDialog>
    </>
  );
}
