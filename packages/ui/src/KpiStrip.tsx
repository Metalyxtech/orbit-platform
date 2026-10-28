export function KpiStrip({ items }: { items: { value: string; label: string; tone?: 'hivis' }[] }) {
  return (
    <div className="o-kpis">
      {items.map((k) => (
        <div className="o-kpi" key={k.label}>
          <div className={`v ${k.tone ?? ''}`}>{k.value}</div>
          <div className="l">{k.label}</div>
        </div>
      ))}
    </div>
  );
}
