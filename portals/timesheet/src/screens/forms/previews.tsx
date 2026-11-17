/** Small drawings of each form, shown on the admin's choice cards. */
export function WeeklyGridPreview() {
  const cols = 7;
  return (
    <svg viewBox="0 0 200 110" role="img" aria-label="Weekly grid preview" className="o-form-preview">
      <rect x="0" y="0" width="200" height="110" rx="4" fill="var(--sheet)" stroke="var(--line)" />
      <rect x="0" y="0" width="200" height="18" rx="4" fill="var(--line-2)" />
      {Array.from({ length: cols }, (_, c) => (
        <rect key={`h${c}`} x={70 + c * 18} y="6" width="12" height="6" rx="1" fill="var(--ink-3, #9aa3ab)" />
      ))}
      {[0, 1, 2, 3].map((r) => (
        <g key={r}>
          <rect x="8" y={26 + r * 18} width="52" height="8" rx="2" fill="var(--steel)" opacity={0.75 - r * 0.12} />
          {Array.from({ length: cols }, (_, c) => (
            <rect key={c} x={68 + c * 18} y={24 + r * 18} width="15" height="12" rx="2" fill={c > 4 ? 'var(--line-2)' : '#fff'} stroke="var(--line)" />
          ))}
        </g>
      ))}
      <rect x="68" y="98" width="123" height="6" rx="2" fill="var(--hivis-tint)" stroke="var(--hivis)" strokeWidth="0.6" />
    </svg>
  );
}

export function DailyLogPreview() {
  return (
    <svg viewBox="0 0 200 110" role="img" aria-label="Day by day preview" className="o-form-preview">
      <rect x="0" y="0" width="200" height="110" rx="4" fill="var(--line-2)" />
      {[0, 1, 2].map((d) => (
        <g key={d} transform={`translate(8 ${6 + d * 34})`}>
          <rect width="184" height="30" rx="3" fill="var(--sheet)" stroke="var(--line)" />
          <rect x="6" y="5" width="30" height="6" rx="2" fill="var(--ink-2, #4b5560)" />
          <rect x="150" y="5" width="28" height="6" rx="2" fill="var(--steel)" />
          <rect x="6" y="16" width="70" height="9" rx="2" fill="#fff" stroke="var(--line)" />
          <rect x="80" y="16" width="60" height="9" rx="2" fill="#fff" stroke="var(--line)" />
          <rect x="146" y="16" width="32" height="9" rx="2" fill="#fff" stroke="var(--steel)" />
        </g>
      ))}
    </svg>
  );
}
