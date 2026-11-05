/** Grouped columns (for example ordered vs requested per month). Plain SVG, no library. */
export function ColumnChart({
  points,
  series,
  height = 200,
  format = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }),
}: {
  points: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  height?: number;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...points.flatMap((p) => p.values));
  const bw = 22;
  const inGap = 4;
  const group = series.length * bw + (series.length - 1) * inGap;
  const gap = 26;
  const top = 20;
  const bottom = 24;
  const inner = height - top - bottom;
  const width = points.length * (group + gap) + gap;
  if (points.every((p) => p.values.every((v) => v === 0))) return <div className="o-empty">Nothing to show for this period.</div>;
  return (
    <div>
      <div className="o-legend" style={{ marginBottom: 6 }}>
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.map((s) => s.name).join(' and ')} style={{ width: '100%', height }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} x2={width} y1={top + inner * (1 - f)} y2={top + inner * (1 - f)} stroke="var(--line-2)" />
        ))}
        {points.map((p, i) => {
          const x0 = gap + i * (group + gap);
          return (
            <g key={p.label}>
              {p.values.map((v, j) => {
                const h = (v / max) * inner;
                const x = x0 + j * (bw + inGap);
                return (
                  <g key={j}>
                    <rect x={x} y={top + inner - h} width={bw} height={Math.max(h, v > 0 ? 1 : 0)} fill={series[j].color} rx={2}>
                      <title>{`${p.label} · ${series[j].name}: ${format(v)}`}</title>
                    </rect>
                    {v > 0 && (
                      <text x={x + bw / 2} y={top + inner - h - 4} textAnchor="middle" fontSize={9} fill="var(--ink-2)">
                        {format(v)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={x0 + group / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Headline numbers with the change against the previous period. */
export function CompareKpis({
  items,
}: {
  items: { label: string; value: string; now: number; before: number | null; goodWhen?: 'up' | 'down'; note?: string }[];
}) {
  return (
    <div className="o-kpis o-cmp">
      {items.map((k) => {
        const diff = k.before == null ? 0 : k.now - k.before;
        const pct = k.before ? Math.round((diff / Math.abs(k.before)) * 100) : k.now ? 100 : 0;
        const good = diff === 0 || k.before == null ? null : (diff > 0) === ((k.goodWhen ?? 'up') === 'up');
        return (
          <div className="o-kpi" key={k.label}>
            <div className="v">{k.value}</div>
            <div className="l">{k.label}</div>
            <div className={`o-delta ${good === null ? '' : good ? 'up' : 'down'}`}>
              {k.before == null ? (k.note ?? '') : diff === 0 ? 'Same as last month' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last month`}
              {k.before != null && k.note ? ` · ${k.note}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}
