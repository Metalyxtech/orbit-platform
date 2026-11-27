'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, DataTable, EmptyState, TopBar, useToast } from '@orbit/ui';
import { deleteHolidayAction, saveHolidayAction, saveOtRatesAction, saveShiftAction, setShiftActiveAction } from '../actions';

type Shift = { id: string; name: string; startTime: string; endTime: string; breakMinutes: number; hours: number; color: string; active: boolean };
type Holiday = { id: string; holidayDate: string; name: string };

const COLORS = ['#2f5d8a', '#2e7d5b', '#8a5a2f', '#6b3fa0', '#b04a4a', '#3f7f9a'];
const blank = { id: undefined as string | undefined, name: '', startTime: '08:00', endTime: '17:00', breakMinutes: 60, color: COLORS[0] };

/** Timesheet admin > Shifts and holidays: the shifts managers roster, public holidays, and overtime rates. */
export function ShiftsClient({ shifts, holidays, year, rates }: { shifts: Shift[]; holidays: Holiday[]; year: number; rates: { workday: number; offday: number } }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(blank);
  const [hol, setHol] = useState({ date: `${year}-01-26`, name: '' });
  const [r, setR] = useState(rates);

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, after?: () => void) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(done);
    after?.();
    router.refresh();
  }

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Settings', 'Shifts and holidays']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Shifts and holidays</h1>
            <p>Shifts supervisors and project managers pick on the roster, the public holidays, and the overtime rates for payroll.</p>
          </div>
        </div>

        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Shifts</h2>
          </div>
          <DataTable
            rows={shifts}
            rowKey={(s) => s.id}
            empty={<EmptyState title="No shifts yet. Add the first one below." />}
            columns={[
              {
                key: 'n',
                header: 'Shift',
                render: (s) => (
                  <span className="o-row" style={{ gap: 8 }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
                    <strong className={s.active ? '' : 'faint'}>{s.name}</strong>
                  </span>
                ),
              },
              { key: 't', header: 'Time', render: (s) => `${s.startTime}-${s.endTime}` },
              { key: 'b', header: 'Break', num: true, render: (s) => `${s.breakMinutes} min` },
              { key: 'h', header: 'Paid hours', num: true, render: (s) => s.hours.toFixed(2) },
              {
                key: 'a',
                header: '',
                render: (s) => (
                  <div className="o-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <Button size="small" disabled={busy} onClick={() => setEdit({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, color: s.color })}>
                      Edit
                    </Button>
                    <Button size="small" disabled={busy} onClick={() => void run(() => setShiftActiveAction({ id: s.id, active: !s.active }), s.active ? `${s.name} switched off.` : `${s.name} switched on.`)}>
                      {s.active ? 'Switch off' : 'Switch on'}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="o-panel">
          <h2>{edit.id ? `Edit ${edit.name}` : 'Add a shift'}</h2>
          <div className="o-grid2">
            <label className="o-field">
              Name
              <input className="o-input" maxLength={40} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Day, Night, Half day" />
            </label>
            <label className="o-field">
              Break (minutes)
              <input className="o-input" type="number" min={0} max={600} value={edit.breakMinutes} onChange={(e) => setEdit({ ...edit, breakMinutes: Number(e.target.value) || 0 })} />
            </label>
            <label className="o-field">
              Starts
              <input className="o-input" type="time" value={edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.value })} />
            </label>
            <label className="o-field">
              Ends (next day if earlier)
              <input className="o-input" type="time" value={edit.endTime} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} />
            </label>
          </div>
          <div className="o-row" style={{ gap: 6, margin: '4px 0 12px' }} role="radiogroup" aria-label="Colour">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={edit.color === c} aria-label={c} onClick={() => setEdit({ ...edit, color: c })} style={{ width: 26, height: 26, borderRadius: 6, background: c, border: edit.color === c ? '3px solid var(--ink)' : '1px solid var(--line)', cursor: 'pointer' }} />
            ))}
          </div>
          <div className="o-row" style={{ gap: 8 }}>
            <Button variant="primary" disabled={busy || !edit.name.trim()} onClick={() => void run(() => saveShiftAction(edit), edit.id ? 'Shift saved.' : 'Shift added.', () => setEdit(blank))}>
              {edit.id ? 'Save shift' : 'Add shift'}
            </Button>
            {edit.id && <Button onClick={() => setEdit(blank)}>Cancel</Button>}
          </div>
        </div>

        <div className="o-cols">
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Public holidays {year}</h2>
              <form className="o-row" style={{ gap: 6 }}>
                <input className="o-input" type="number" name="year" defaultValue={year} min={2020} max={2100} aria-label="Year" style={{ width: 90 }} />
                <button className="o-btn small" type="submit">
                  Show
                </button>
              </form>
            </div>
            <DataTable
              rows={holidays}
              rowKey={(x) => x.id}
              empty={<EmptyState title="No holidays for this year yet." />}
              columns={[
                { key: 'd', header: 'Date', render: (x) => new Date(`${x.holidayDate}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) },
                { key: 'n', header: 'Holiday', render: (x) => x.name },
                {
                  key: 'x',
                  header: '',
                  render: (x) => (
                    <Button size="small" disabled={busy} onClick={() => void run(() => deleteHolidayAction({ id: x.id }), `${x.name} removed.`)}>
                      Remove
                    </Button>
                  ),
                },
              ]}
            />
            <div className="o-row" style={{ gap: 8, padding: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="o-field" style={{ margin: 0 }}>
                Date
                <input className="o-input" type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
              </label>
              <label className="o-field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
                Name
                <input className="o-input" maxLength={80} value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} placeholder="Republic Day" />
              </label>
              <Button variant="primary" disabled={busy || hol.name.trim().length < 2} onClick={() => void run(() => saveHolidayAction(hol), 'Holiday added.', () => setHol({ ...hol, name: '' }))}>
                Add holiday
              </Button>
            </div>
          </div>

          <div className="o-panel">
            <h2>Overtime rates for payroll</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Overtime hours are multiplied by these in the overtime report.</p>
            <div className="o-grid2">
              <label className="o-field">
                Working days
                <input className="o-input" type="number" min={1} max={5} step={0.25} value={r.workday} onChange={(e) => setR({ ...r, workday: Number(e.target.value) || 1 })} />
              </label>
              <label className="o-field">
                Days off and holidays
                <input className="o-input" type="number" min={1} max={5} step={0.25} value={r.offday} onChange={(e) => setR({ ...r, offday: Number(e.target.value) || 1 })} />
              </label>
            </div>
            <Button variant="primary" disabled={busy} onClick={() => void run(() => saveOtRatesAction(r), 'Overtime rates saved.')}>
              Save rates
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
