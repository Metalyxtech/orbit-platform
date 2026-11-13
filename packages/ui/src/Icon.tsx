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
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7.5 8 6 8-6" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h7l4.5 4.5v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z" />
      <path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h5" />
    </>
  ),
  cart: (
    <>
      <path d="M3.5 4.5h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.1l1.4-6.3H6.6" />
      <circle cx="9.5" cy="19.5" r="1.2" />
      <circle cx="17" cy="19.5" r="1.2" />
    </>
  ),
  box: (
    <>
      <path d="M12 3.5 4.5 7.5v9L12 20.5l7.5-4v-9z" />
      <path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6.5h10.5v10H3zM13.5 10h4l3.5 3.5v3h-7.5" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  trend: <path d="m3.5 16.5 5.5-5.5 4 4 7.5-7.5M15.5 7.5h5v5" />,
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6-2.4-1.6z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6z" />
      <path d="m9 12 2.2 2.2L15 10.4" />
    </>
  ),
  puzzle: <path d="M9.5 4.5h5v3a1.75 1.75 0 1 0 3.5 0v0h1.5v5h-2a1.75 1.75 0 1 0 0 3.5h2v3.5h-5v-2a1.75 1.75 0 1 0-3.5 0v2h-5.5v-5h2a1.75 1.75 0 1 0 0-3.5h-2v-5h5z" />,
  building: (
    <>
      <path d="M5 20.5v-15a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 5.5v15M15 10h3a1.5 1.5 0 0 1 1.5 1.5v9M3.5 20.5h17" />
      <path d="M8.5 8h3M8.5 11.5h3M8.5 15h3" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5 6.5 5.5h11l2.5 8v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" />
      <path d="M4 13.5h4.5l1 2.5h5l1-2.5H20" />
    </>
  ),
  wrench: <path d="M14.5 6.5a4 4 0 0 1 5-3l-2.6 2.6.6 2.4 2.4.6 2.6-2.6a4 4 0 0 1-5.6 4.6L8.5 19.5a2 2 0 0 1-2.8-2.8l8.4-8.4a4 4 0 0 1 .4-1.800z" />,
  badge: (
    <>
      <path d="M12 3.5l2.2 1.7 2.8-.1.800 2.7 2.3 1.6-1 2.6 1 2.6-2.3 1.6-.8 2.7-2.8-.1L12 20.5l-2.2-1.7-2.8.1-.8-2.7-2.3-1.6 1-2.6-1-2.6 2.3-1.6.8-2.7 2.8.1z" />
      <path d="m9 12 2.2 2.2L15 10.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  down: <path d="m6 9.5 6 6 6-6" />,
  dot: <circle cx="12" cy="12" r="2.5" />,
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

/** Picks a menu icon from the wording of a menu entry, so every portal's menu gets icons without listing them. */
const MENU_ICONS: [RegExp, IconName][] = [
  [/dashboard|overview|home/, 'grid'],
  [/management/, 'building'],
  [/process control/, 'shield'],
  [/approval|task/, 'check'],
  [/message/, 'mail'],
  [/terms|privacy/, 'shield'],
  [/history|ledger|log/, 'clock'],
  [/insight|chart|report/, 'chart'],
  [/setting|workflow|rule|role|numbering/, 'sliders'],
  [/custom(?!er)/, 'puzzle'],
  [/billing|plan|subscription/, 'card'],
  [/supplier/, 'truck'],
  [/stock|store/, 'box'],
  [/target/, 'target'],
  [/order|invoice|money/, 'receipt'],
  [/sell|sales|pipeline|enquir|quotation/, 'trend'],
  [/requests$/, 'inbox'],
  [/purchas|requisition|request/, 'cart'],
  [/production|shop|trade/, 'wrench'],
  [/quality|inspection/, 'badge'],
  [/timesheet|week/, 'calendar'],
  [/people|team|customer/, 'team'],
  [/user/, 'user'],
  [/compan|portal/, 'building'],
  [/document|form|agreement|project/, 'file'],
];

export function menuIcon(label: string): IconName {
  const l = label.toLowerCase();
  return MENU_ICONS.find(([re]) => re.test(l))?.[1] ?? 'dot';
}
