import type { ReactNode } from 'react';

const PATHS = {
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10.5h17" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M2.75 19.5c0-3.3 2.8-5.5 6.25-5.5s6.25 2.2 6.25 5.5" />
      <path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.3c2.2.6 3.75 2.4 3.75 5.2" />
    </>
  ),
  chart: <path d="M4 20V11M10 20V4.5M16 20v-6.5M21 20H3" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20c0-3.7 3.3-6 7.5-6s7.5 2.3 7.5 6" />
    </>
  ),
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.5h7.4a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  sliders: (
    <>
      <path d="M4 7.5h9M18.5 7.5H20M4 16.5h2.5M12 16.5h8" />
      <circle cx="15.75" cy="7.5" r="2.25" />
      <circle cx="9.25" cy="16.5" r="2.25" />
    </>
  ),
  signout: <path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10M15 16l4-4-4-4M19 12H9.5" />,
  left: <path d="m14.5 6-6 6 6 6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  download: <path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;
export const isIconName = (name: string | undefined): name is IconName => !!name && name in PATHS;

/** 24 px stroke icons drawn for Orbit; decorative unless a label is given. */
export function Icon({ name, size, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="o-ico"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** Initials in a circle; the tint is derived from the name so a person keeps their colour. */
export function Avatar({ name, initials, size }: { name: string; initials?: string; size?: 'sm' }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`o-avatar ${size ?? ''}`} data-tone={h % 5} aria-hidden>
      {initials ?? initialsOf(name)}
    </span>
  );
}
