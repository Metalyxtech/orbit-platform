/**
 * Horizontal stacked bars: one row per label, one coloured part per series, with a legend.
 * Used for status splits per person and approval ageing. Plain HTML/CSS, no library.
 */
export function StackedBarChart({
  rows,
  series,
  unit = '',
  max = 15,
  keepEmpty = false,
}: {
  rows: { label: string; detail?: string; parts: number[] }[];
  series: { name: string; color: string }[];
  unit?: string;
  max?: number;
  /** Keep rows whose parts are all 0 (for fixed groups such as age buckets). */
  keepEmpty?: boolean;
}) {
  const candidates = keepEmpty ? rows : rows.filter((r) => r.parts.some((p) => p > 0));
  const shown = candidates.slice(0, max);
  if (shown.length === 0 || shown.every((r) => r.parts.every((p) => p === 0))) {
    return <div className="o-empty">Nothing to show for this period.</div>;
  }
  const top = Math.max(1, ...shown.map((r) => r.parts.reduce((a, b) => a + b, 0)));
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return (
    <div className="o-stack-chart">
      <div className="o-legend" style={{ marginBottom: 8 }}>
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      {shown.map((r) => {
        const total = r.parts.reduce((a, b) => a + b, 0);
        return (
          <div key={r.label} className="o-stack-row">
            <span className="o-stack-label" title={r.detail ? `${r.label}, ${r.detail}` : r.label}>
              {r.label}
              {r.detail && <span className="faint"> {r.detail}</span>}
            </span>
            <span className="o-stack-track">
              {r.parts.map((p, i) =>
                p > 0 ? (
                  <span
                    key={series[i].name}
                    className="o-stack-part"
                    style={{ width: `${(p / top) * 100}%`, background: series[i].color }}
                    title={`${series[i].name}: ${fmt(p)}${unit ? ` ${unit}` : ''}`}
                  />
                ) : null,
              )}
            </span>
            <span className="num" style={{ fontSize: 12 }}>
              {fmt(total)}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
        );
      })}
      {candidates.length > shown.length && <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>Showing the top {max}.</div>}
    </div>
  );
}
