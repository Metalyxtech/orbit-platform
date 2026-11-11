'use client';
import { switchCompanyAction } from './session-actions';

/** "Switch company" for people in several companies; reopens Orbit in the chosen one. */
export function CompanySwitcher({ companies, current }: { companies: { id: string; name: string }[]; current: string }) {
  if (companies.length < 2) return null;
  return (
    <select
      aria-label="Switch company"
      value={current}
      onChange={async (e) => {
        await switchCompanyAction(e.target.value);
        window.location.assign('/');
      }}
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
