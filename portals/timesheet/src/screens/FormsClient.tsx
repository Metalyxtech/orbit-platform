'use client';
import { useState } from 'react';
import { TopBar, useToast } from '@orbit/ui';
import { setFormChoiceAction } from '../actions';
import { formComponents } from './forms/registry';
import type { TimesheetFormId } from '../forms';

type Form = { id: TimesheetFormId; name: string; summary: string; bestFor: string; points: string[] };
type RoleChoice = { role: string; label: string; detail: string; formId: TimesheetFormId };

/** Admin > Timesheet forms: the forms on offer, and which one each role fills in. */
export function FormsClient({ forms, roles: initial }: { forms: Form[]; roles: RoleChoice[] }) {
  const toast = useToast();
  const [roles, setRoles] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const used = (id: string) => roles.filter((r) => r.formId === id);

  async function choose(role: RoleChoice, formId: TimesheetFormId) {
    if (role.formId === formId || busy) return;
    setBusy(role.role);
    const before = roles;
    setRoles((rs) => rs.map((r) => (r.role === role.role ? { ...r, formId } : r)));
    const res = await setFormChoiceAction({ role: role.role, formId });
    setBusy(null);
    if (!res.ok) {
      setRoles(before);
      return toast(res.error, 'bad');
    }
    toast(`${role.label} now use "${forms.find((f) => f.id === formId)?.name}". They see it next time they open My week.`);
  }

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Admin', 'Timesheet forms']} />
      <div className="o-page">
        <div>
          <h1>Timesheet forms</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Choose the form each role fills in on My week. Both forms save the same hours, so you can switch at any time without losing anything.
          </p>
        </div>

        <div className="o-form-gallery">
          {forms.map((f) => {
            const Preview = formComponents[f.id].Preview;
            const who = used(f.id);
            return (
              <article key={f.id} className="o-panel o-form-card">
                <Preview />
                <div className="o-row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                  <h2 style={{ margin: 0 }}>{f.name}</h2>
                  <span className={`o-chip ${who.length ? 'ok' : ''}`}>{who.length ? `Used by ${who.length} ${who.length === 1 ? 'role' : 'roles'}` : 'Not in use'}</span>
                </div>
                <p style={{ fontSize: 13, margin: '6px 0' }}>{f.summary}</p>
                <ul className="o-form-points">
                  {f.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className="faint" style={{ fontSize: 11, margin: '8px 0 0' }}>
                  Best for: {f.bestFor}
                </p>
              </article>
            );
          })}
        </div>

        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Who uses which form</h2>
          </div>
          <div className="o-scroll">
            <table className="o-table o-form-matrix">
              <thead>
                <tr>
                  <th>Role</th>
                  {forms.map((f) => (
                    <th key={f.id}>{f.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.role}>
                    <td>
                      <strong>{r.label}</strong>
                      <div className="faint" style={{ fontSize: 11 }}>{r.detail}</div>
                    </td>
                    {forms.map((f) => {
                      const on = r.formId === f.id;
                      return (
                        <td key={f.id}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={`${r.label}: ${f.name}`}
                            className={`o-form-choice${on ? ' on' : ''}`}
                            disabled={busy === r.role}
                            onClick={() => choose(r, f.id)}
                          >
                            <span className="o-form-dot" aria-hidden />
                            {on ? 'In use' : 'Use this form'}
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
      </div>
    </>
  );
}
