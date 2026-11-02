/** Distinct, colour-blind-friendly slice colours; the last one is used for "Others". */
const COLORS = ['#2f5d8a', '#e07b39', '#3a9a6b', '#8b5fbf', '#c94f6d', '#d4a72c', '#4aa3c7', '#7a8b5b', '#9aa3ab'];

/**
 * Donut chart with a legend. Shows up to `max` slices; the rest are grouped as "Others".
 * Plain SVG, no library.
 */
export function PieChart({
  slices,
  unit = 'h',
  max = 8,
  size = 200,
}: {
  slices: { label: string; value: number; detail?: string }[];
  unit?: string;
  max?: number;
  size?: number;
}) {
  const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max).reduce((n, s) => n + s.value, 0);
  const data = rest > 0 ? [...shown, { label: `Others (${sorted.length - max})`, value: rest }] : shown;
  const total = data.reduce((n, s) => n + s.value, 0);
  if (total === 0) return <div className="o-empty">No hours in this period yet.</div>;

  const r = size / 2;
  const ring = size * 0.18;
  let angle = -Math.PI / 2;
  const arcs = data.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const color = i === data.length - 1 && rest > 0 ? COLORS[COLORS.length - 1] : COLORS[i % (COLORS.length - 1)];
    const outer = r - 2;
    const inner = outer - ring;
    const p = (rad: number, a: number) => `${r + rad * Math.cos(a)} ${r + rad * Math.sin(a)}`;
    const large = sweep > Math.PI ? 1 : 0;
    // A full circle cannot be drawn as one arc; split it in two.
    const d =
      data.length === 1
        ? `M ${p(outer, 0)} A ${outer} ${outer} 0 1 1 ${p(outer, Math.PI)} A ${outer} ${outer} 0 1 1 ${p(outer, 0)} M ${p(inner, 0)} A ${inner} ${inner} 0 1 0 ${p(inner, Math.PI)} A ${inner} ${inner} 0 1 0 ${p(inner, 0)} Z`
        : `M ${p(outer, a0)} A ${outer} ${outer} 0 ${large} 1 ${p(outer, a1)} L ${p(inner, a1)} A ${inner} ${inner} 0 ${large} 0 ${p(inner, a0)} Z`;
    return { ...s, d, color, pct: Math.round((s.value / total) * 1000) / 10 };
  });

  return (
    <div className="o-pie">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Hours by person">
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill={a.color} fillRule="evenodd" stroke="var(--sheet)" strokeWidth={1}>
            <title>{`${a.label}: ${a.value.toFixed(1)} ${unit} (${a.pct}%)`}</title>
          </path>
        ))}
        <text x={r} y={r - 4} textAnchor="middle" fontSize={20} fontWeight={600} fill="var(--ink)">
          {total.toFixed(0)}
        </text>
        <text x={r} y={r + 14} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
          total {unit}
        </text>
      </svg>
      <ul className="o-pie-legend">
        {arcs.map((a) => (
          <li key={a.label}>
            <i style={{ background: a.color }} />
            <span className="name">
              {a.label}
              {a.detail && <span className="faint"> {a.detail}</span>}
            </span>
            <span className="num">
              {a.value.toFixed(1)} {unit}
            </span>
            <span className="num faint">{a.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
