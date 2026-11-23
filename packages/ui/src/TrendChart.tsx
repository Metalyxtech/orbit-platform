/** Weekly columns, regular stacked under overtime, with the value on top. Plain SVG, no library. */
export function TrendChart({ points, height = 180 }: { points: { label: string; regular: number; overtime: number }[]; height?: number }) {
  const max = Math.max(1, ...points.map((p) => p.regular + p.overtime));
  const w = 56;
  const gap = 14;
  const top = 18;
  const bottom = 22;
  const inner = height - top - bottom;
  const width = points.length * (w + gap) + gap;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hours per week" style={{ width: '100%', height }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={0} x2={width} y1={top + inner * (1 - f)} y2={top + inner * (1 - f)} stroke="var(--line-2)" />
      ))}
      {points.map((p, i) => {
        const x = gap + i * (w + gap);
        const rh = (p.regular / max) * inner;
        const oh = (p.overtime / max) * inner;
        const total = p.regular + p.overtime;
        return (
          <g key={p.label}>
            <rect x={x} y={top + inner - rh} width={w} height={rh} fill="var(--steel)" rx={2} />
            {oh > 0 && <rect x={x} y={top + inner - rh - oh} width={w} height={oh} fill="var(--hivis-tint)" stroke="var(--hivis)" strokeWidth={1} />}
            <text x={x + w / 2} y={top + inner - rh - oh - 5} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
              {total ? total.toFixed(0) : ''}
            </text>
            <text x={x + w / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
