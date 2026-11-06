import type { LegalDocument } from './documents';

/** One legal document as readable text. `compact` fits it in a scroll box on the sign page. */
export function LegalText({ doc, compact }: { doc: LegalDocument; compact?: boolean }) {
  return (
    <article className="o-legal" style={compact ? { maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 4, padding: '12px 14px', background: 'var(--paper, #fff)' } : undefined}>
      {!compact && <h1 style={{ marginBottom: 4 }}>{doc.title}</h1>}
      <p className="faint" style={{ fontSize: 12, margin: '0 0 10px' }}>
        Version {doc.version} · effective {doc.effective}
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.55 }}>{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading}>
          <h3 style={{ fontSize: 13, margin: '14px 0 4px' }}>{s.heading}</h3>
          {s.body.map((p, i) => (
            <p key={i} style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 6px' }}>
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
