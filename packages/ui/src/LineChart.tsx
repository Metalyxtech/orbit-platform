/**
 * Line chart for trends over time: one or more series, grid lines, dots and (for a single series)
 * the value above each point. Plain SVG, no library; it scales to the width of its panel.
 */
export function LineChart({
  points,
  series,
  height = 210,
  format = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }),
  area = false,
  empty = 'Nothing to show for this period.',
  label = 'Trend',
}: {
  points: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  height?: number;
  format?: (v: number) => string;
  /** Shade under the line (single series reads best). */
  area?: boolean;
  empty?: string;
  label?: string;
}) {
  if (!points.length || points.every((p) => p.values.every((v) => !v))) return <div className="o-empty">{empty}</div>;
  // Drawn at about the width of a chart panel, so the labels stay readable when it scales.
  const W = 440;
  const left = 50;
  const right = 18;
  const top = 22;
  const bottom = 26;
  const iw = W - left - right;
  const ih = height - top - bottom;
  const raw = Math.max(1, ...points.flatMap((p) => p.values));
  // Round the top of the scale up to a clean number so the grid labels read well.
  // Small counts get an even top so the three grid labels (0, half, top) are whole numbers.
  const mag = 10 ** Math.floor(Math.log10(raw));
  const max = raw <= 10 ? Math.max(2, Math.ceil(raw / 2) * 2) : Math.ceil(raw / mag) * mag || 1;
  const x = (i: number) => left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => top + ih - (v / max) * ih;
  // Label about six points on the axis at most, always including the last.
  const every = Math.max(1, Math.ceil(points.length / 7));
  return (
    <div>
      {series.length > 1 && (
        <div className="o-legend" style={{ marginBottom: 6 }}>
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color, borderColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W - right} y1={top + ih * (1 - f)} y2={top + ih * (1 - f)} stroke={f === 0 ? 'var(--line)' : 'var(--line-2)'} />
            <text x={left - 8} y={top + ih * (1 - f) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
              {format(max * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={height - 7} textAnchor="middle" fontSize={12} fill="var(--ink-2)">
              {p.label}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const d = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.values[si] ?? 0).toFixed(1)}`).join(' ');
          return (
            <g key={s.name}>
              {area && <path d={`${d} L ${x(points.length - 1).toFixed(1)} ${top + ih} L ${x(0).toFixed(1)} ${top + ih} Z`} fill={s.color} opacity={0.1} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={x(i)} cy={y(p.values[si] ?? 0)} r={3.2} fill="var(--sheet)" stroke={s.color} strokeWidth={2}>
                    <title>{`${p.label} · ${s.name}: ${format(p.values[si] ?? 0)}`}</title>
                  </circle>
                  {series.length === 1 && points.length <= 8 && (p.values[si] ?? 0) > 0 && (
                    <text x={Math.min(W - right - 16, Math.max(left + 16, x(i)))} y={y(p.values[si] ?? 0) - 9} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ink)">
                      {format(p.values[si] ?? 0)}
                    </text>
                  )}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
