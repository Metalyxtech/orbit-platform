export interface RouteItem {
  name: string;
  detail?: string;
  state: 'done' | 'current' | 'next';
}

/** Vertical timeline used in "Who will approve" and the approvals detail. */
export function ApprovalRoute({ items }: { items: RouteItem[] }) {
  return (
    <ol className="o-route">
      {items.map((it, i) => (
        <li key={i} className={it.state}>
          <span className="dot" aria-hidden />
          <strong>{it.name}</strong>
          {it.detail && <small>{it.detail}</small>}
        </li>
      ))}
    </ol>
  );
}
