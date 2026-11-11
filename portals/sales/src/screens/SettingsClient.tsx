'use client';
import { useMemo, useState } from 'react';
import { Chip, RoleCoverage, SaveBar } from '@orbit/ui';
import { roleLabel, SALES_ROLES, type SalesConfig, type SalesRole } from '../config';
import { saveSalesAdminAction } from '../actions';
import type { SalesPerson } from '../server';
import { useRun } from './useRun';

// Sales settings for the company admin. Every edit stays a draft on this page: nothing reaches
// the portal until Save changes (with a confirmation). Discard puts everything back.

type Settings = Pick<SalesConfig, 'managerDiscount' | 'minMargin' | 'gst' | 'currency' | 'validityDays' | 'paymentTermsDays' | 'defaultAdvance' | 'terms' | 'gmApproval'>;
type Draft = Record<string, { role: SalesRole; access: SalesPerson['access']; covers: SalesRole[] }>;
/** Jobs a company admin can also do in Sales (their task list follows these). */
const COVERABLE: SalesRole[] = ['manager', 'accounts', 'estimator'];
const sameSet = (a: SalesRole[], b: SalesRole[]) => a.length === b.length && a.every((x) => b.includes(x));

const pickSettings = (c: SalesConfig): Settings => ({
  managerDiscount: c.managerDiscount,
  minMargin: c.minMargin,
  gst: c.gst,
  currency: c.currency,
  validityDays: c.validityDays,
  paymentTermsDays: c.paymentTermsDays,
  defaultAdvance: c.defaultAdvance,
  terms: c.terms,
  gmApproval: c.gmApproval,
});
const teamDraft = (team: SalesPerson[]): Draft => Object.fromEntries(team.map((p) => [p.membershipId, { role: p.salesRole, access: p.access, covers: p.covers }]));

export function SettingsClient({ cfg, team }: { cfg: SalesConfig; team: SalesPerson[] }) {
  const { busy, run } = useRun();
  const saved = useMemo(() => pickSettings(cfg), [cfg]);
  const savedTeam = useMemo(() => teamDraft(team), [team]);
  const [f, setF] = useState<Settings>(saved);
  const [t, setT] = useState<Draft>(savedTeam);

  const settingsChanged = (Object.keys(saved) as (keyof Settings)[]).filter((k) => saved[k] !== f[k]);
  const teamChanges = team.filter((p) => t[p.membershipId].role !== p.salesRole || t[p.membershipId].access !== p.access || !sameSet(t[p.membershipId].covers, p.covers));
  const dirty = settingsChanged.length > 0 || teamChanges.length > 0;
  const changedRow = (id: string) => teamChanges.some((p) => p.membershipId === id);
  // Coverage counts the draft: role holders with Sales access, plus admins who also work as the role.
  const workRoles = SALES_ROLES.filter((r) => r.id !== 'admin');
  const counts = Object.fromEntries(
    workRoles.map((r) => [r.id, team.filter((p) => (p.companyRole === 'company_admin' ? t[p.membershipId].covers.includes(r.id) : t[p.membershipId].access === 'on' && t[p.membershipId].role === r.id)).length]),
  );

  const setRole = (p: SalesPerson, role: SalesRole) =>
    // A sales role means the person works in Sales: open the portal for them in the same draft.
    setT({ ...t, [p.membershipId]: { ...t[p.membershipId], role, access: p.access === 'on' ? t[p.membershipId].access : role !== p.salesRole ? 'on' : p.access } });
  const setAccess = (p: SalesPerson, on: boolean) => setT({ ...t, [p.membershipId]: { ...t[p.membershipId], access: on ? 'on' : p.access === 'on' ? 'off' : p.access } });

  const toggleCover = (p: SalesPerson, r: SalesRole, on: boolean) => {
    const cur = t[p.membershipId].covers;
    setT({ ...t, [p.membershipId]: { ...t[p.membershipId], covers: on ? [...cur, r] : cur.filter((x) => x !== r) } });
  };

  const numField = (k: Exclude<keyof Settings, 'currency' | 'terms'>, label: string, help?: string) => (
    <label className="o-field">
      {label}
      <input className={`o-input${saved[k] !== f[k] ? ' changed' : ''}`} type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) || 0 })} style={saved[k] !== f[k] ? { borderColor: 'var(--hivis, #d97706)' } : undefined} />
      {help && <span className="help">{help}</span>}
    </label>
  );

  const summary = [
    ...settingsChanged.map((k) => `${k}: ${String(saved[k]).slice(0, 30)} → ${String(f[k]).slice(0, 30)}`),
    ...teamChanges.map((p) => {
      const d = t[p.membershipId];
      const parts = [
        d.role !== p.salesRole ? `${roleLabel(p.salesRole)} → ${roleLabel(d.role)}` : '',
        d.access !== p.access ? (d.access === 'on' ? 'gets Sales access' : 'loses Sales access') : '',
        !sameSet(d.covers, p.covers) ? `also works as ${d.covers.length ? d.covers.map(roleLabel).join(', ') : 'nothing else'}` : '',
      ].filter(Boolean);
      return `${p.name}: ${parts.join(', ')}`;
    }),
  ];

  return (
    <>
      <div className="o-panel">
        <h2>Approvals and quotation</h2>
        <div className="o-form-row">
          {numField('managerDiscount', 'Flag discounts above %', 'Shown to the sales manager when approving')}
          {numField('minMargin', 'Warn when margin is under %')}
          {numField('gst', 'GST %')}
          <label className="o-field">
            Currency symbol
            <input className="o-input" value={f.currency} maxLength={4} onChange={(e) => setF({ ...f, currency: e.target.value })} />
          </label>
          {numField('validityDays', 'Quotation valid for days')}
          {numField('paymentTermsDays', 'Invoice due after days')}
          {numField('defaultAdvance', 'Default advance %')}
          <p className="help" style={{ gridColumn: '1 / -1', margin: 0 }}>
            The sales manager approves every quotation (with a comment, and can change the discount); their approval is final. The GM views every enquiry and can stop it and comment.
          </p>
        </div>
        <label className="o-field" style={{ marginTop: 10 }}>
          Terms printed on quotations
          <textarea className="o-textarea" rows={4} value={f.terms} maxLength={2000} onChange={(e) => setF({ ...f, terms: e.target.value })} />
        </label>
      </div>
      <RoleCoverage roles={workRoles} counts={counts} note="Every sales role needs at least one person with Sales access, or a company admin who also works as it." />
      <div className="o-panel flush">
        <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
          <h2>Sales team</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            Choose roles and who can open Sales, then Save changes. Nothing changes in the portal before that.
          </span>
        </div>
        <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Sales role</th>
                <th>Can open Sales</th>
                <th>What they do</th>
              </tr>
            </thead>
            <tbody>
              {team.map((p) => {
                const d = t[p.membershipId];
                const always = p.companyRole === 'company_admin' || p.companyRole === 'management';
                return (
                  <tr key={p.membershipId} className={changedRow(p.membershipId) ? 'selected' : undefined}>
                    <td>
                      {p.name}
                      <div className="faint" style={{ fontSize: 11 }}>
                        {p.email}
                      </div>
                    </td>
                    <td style={{ width: 220 }}>
                      {p.companyRole === 'company_admin' ? (
                        <div className="o-stack" style={{ gap: 4 }}>
                          <Chip tone="steel">{roleLabel('admin')}</Chip>
                          <span className="muted" style={{ fontSize: 11 }}>
                            Also works as:
                          </span>
                          {COVERABLE.map((r) => (
                            <label key={r} className="o-row" style={{ gap: 6, fontSize: 12, cursor: 'pointer' }}>
                              <input type="checkbox" checked={d.covers.includes(r)} disabled={busy} onChange={(e) => toggleCover(p, r, e.target.checked)} aria-label={`${p.name} also works as ${roleLabel(r)}`} />
                              {roleLabel(r)}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <select className="o-select" value={d.role} disabled={busy} aria-label={`Sales role for ${p.name}`} onChange={(e) => setRole(p, e.target.value as SalesRole)}>
                          {SALES_ROLES.filter((r) => r.id !== 'admin').map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ width: 200 }}>
                      {always ? (
                        <Chip tone="ok">Always</Chip>
                      ) : (
                        <label className="o-row" style={{ gap: 8, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={d.access === 'on'} disabled={busy} onChange={(e) => setAccess(p, e.target.checked)} aria-label={`${p.name} can open Sales`} />
                          {d.access === 'on' ? 'Yes' : p.access === 'requested' ? <Chip tone="hivis">Asked for access</Chip> : 'No'}
                        </label>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {p.companyRole === 'company_admin' ? `Everything, plus sales settings. Task list: ${d.covers.length ? d.covers.map(roleLabel).join(', ') : 'none'}.` : SALES_ROLES.find((r) => r.id === d.role)?.detail}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        busy={busy}
        what="Sales settings"
        impact={
          <>
            {summary.length} change{summary.length === 1 ? '' : 's'}:
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
              {summary.slice(0, 12).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            They apply for everyone as soon as you save.
          </>
        }
        onDiscard={() => {
          setF(saved);
          setT(savedTeam);
        }}
        onSave={() =>
          run(
            () =>
              saveSalesAdminAction({
                settings: settingsChanged.length ? f : undefined,
                team: teamChanges.map((p) => ({
                  membershipId: p.membershipId,
                  role: t[p.membershipId].role !== p.salesRole ? t[p.membershipId].role : undefined,
                  access: t[p.membershipId].access !== p.access ? (t[p.membershipId].access === 'on' ? 'on' : 'off') : undefined,
                  covers: !sameSet(t[p.membershipId].covers, p.covers) ? (t[p.membershipId].covers.filter((r) => r !== 'admin') as ('exec' | 'estimator' | 'manager' | 'gm' | 'accounts')[]) : undefined,
                })),
              }),
            'Sales settings saved.',
          )
        }
      />
    </>
  );
}
