/** Hours by day: regular in steel, overtime above the standard day hatched. */
export function DayBarChart({ days, standard }: { days: { label: string; hours: number }[]; standard: number }) {
  const max = Math.max(standard * 1.3, ...days.map((d) => d.hours), 1);
  return (
    <div>
      <div className="o-bars" role="img" aria-label="Hours by day">
        {days.map((d) => {
          const reg = Math.min(d.hours, standard);
          const ot = Math.max(0, d.hours - standard);
          return (
            <div className="o-bar" key={d.label} title={`${d.label}: ${d.hours.toFixed(1)} h`}>
              {ot > 0 && <div className="ot" style={{ height: `${(ot / max) * 100}%` }} />}
              <div className="reg" style={{ height: `${(reg / max) * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="o-bars" style={{ height: 'auto', paddingTop: 0 }}>
        {days.map((d) => (
          <div className="o-bar-l" key={d.label}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBarChart({ rows }: { rows: { label: string; regular: number; overtime: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.regular + r.overtime));
  return (
    <div>
      {rows.map((r) => (
        <div className="o-hbar" key={r.label}>
          <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.label}
          </span>
          <div className="track">
            <div className="reg" style={{ width: `${(r.regular / max) * 100}%` }} />
            {r.overtime > 0 && <div className="ot" style={{ width: `${(r.overtime / max) * 100}%` }} />}
          </div>
          <span className="num">{(r.regular + r.overtime).toLocaleString('en-GB', { maximumFractionDigits: 1 })}</span>
        </div>
      ))}
    </div>
  );
}
