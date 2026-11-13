'use client';
import { Chip } from './StatusChip';

// Lets an admin also take on portal roles (gets those roles' tasks and approvals), and shows how
// many people cover each role. Shared by every portal's team settings; the portal keeps the data.

export interface CoverRole {
  id: string;
  label: string;
}

/** Tick boxes: the roles this admin also covers. Roles nobody else holds are marked "nobody". */
export function RoleCovers({
  roles,
  value,
  onChange,
  vacant = [],
  label = "Also covers (gets these roles' tasks and approvals):",
  name,
}: {
  roles: CoverRole[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Role ids that nobody else holds. */
  vacant?: string[];
  label?: string;
  /** Person's name, for screen readers. */
  name?: string;
}) {
  return (
    <div className="o-stack" style={{ gap: 4 }}>
      <span className="faint" style={{ fontSize: 11 }}>
        {label}
      </span>
      <div className="p-covers" role="group" aria-label={name ? `Roles ${name} also covers` : 'Roles also covered'}>
        {roles.map((r) => {
          const on = value.includes(r.id);
          const nobody = vacant.includes(r.id);
          return (
            <label key={r.id} className={on ? 'on' : undefined} title={nobody ? 'Nobody else holds this role' : undefined}>
              <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((x) => x !== r.id))} />
              {r.label}
              {nobody && <em>nobody</em>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** "Coverage" chips: people per role (role holders plus admins covering it). */
export function RoleCoverage({ roles, counts, needed, note }: { roles: CoverRole[]; counts: Record<string, number>; needed?: string[]; note?: string }) {
  return (
    <div className="o-panel">
      <h2>Coverage</h2>
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
        {note ?? 'Every role needs at least one person, or an admin who covers it.'}
      </p>
      <div className="o-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {roles.map((r) => {
          const n = counts[r.id] ?? 0;
          const need = !needed || needed.includes(r.id);
          return (
            <Chip key={r.id} tone={n ? 'ok' : need ? 'bad' : 'grey'}>
              {r.label} · {n}
              {!n && need ? ' (needed)' : ''}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

/** Same set of roles, in any order. */
export const sameRoles = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
