import { LEGAL_PROVIDER } from './documents';
import { LegalText } from './LegalText';
import { PrintButton } from './PrintButton';
import type { SignedCopy } from './state';

const ROLE: Record<string, string> = {
  company_admin: 'Company admin, on behalf of the company',
  management: 'Management (for themselves)',
  project_manager: 'Project manager (for themselves)',
  supervisor: 'Supervisor (for themselves)',
  employee: 'Employee (for themselves)',
};
const stamp = (d: Date) =>
  `${d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST (${d.toISOString()})`;

/** A signed copy for the record: who signed, how, when, and the exact text, ready to print or save as PDF. */
export function SignedCopyView({ c }: { c: SignedCopy }) {
  const rows: [string, string][] = [
    ['Document', `${c.doc?.title ?? 'Document'} · version ${c.version}`],
    ['Between', `${LEGAL_PROVIDER} (Orbit) and ${c.company ?? 'the person below'}`],
    ['Signed by (typed name)', c.signedName],
    ['Orbit account', `${c.name} <${c.email}>`],
    ['Company', c.company ?? 'Not in a company yet when signed'],
    ['Signed as', c.role ? (ROLE[c.role] ?? c.role) : 'Individual'],
    ['Date and time', stamp(c.at)],
    ['IP address', c.ip ?? 'Not recorded'],
    ['Browser', c.userAgent ?? 'Not recorded'],
    ['Record ID', c.id],
    ['Document fingerprint (SHA-256)', c.hash ?? '-'],
  ];
  return (
    <div className="o-panel signed-copy" style={{ maxWidth: 900 }}>
      <div className="o-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="o-row">
          <div className="o-brand-mark" style={{ borderColor: 'var(--graphite)' }} aria-hidden />
          <strong style={{ fontSize: 18 }}>Orbit · Signed copy</strong>
        </div>
        <PrintButton />
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 0 }}>
        Electronic acceptance recorded by Orbit. The person read the document, ticked “I have read and agree”, typed their name and pressed “Agree and sign”.
      </p>
      <table className="o-table" style={{ marginBottom: 16 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th style={{ width: 230, textAlign: 'left', background: 'transparent' }}>{k}</th>
              <td style={{ wordBreak: 'break-all' }}>{k === 'Signed by (typed name)' ? <em style={{ fontSize: 16 }}>{v}</em> : v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.stored ? (
        c.intact ? (
          <div className="o-banner ok">The text below is exactly what was signed; its fingerprint matches the one saved at signing.</div>
        ) : (
          <div className="o-banner bad">Warning: the saved text no longer matches its fingerprint.</div>
        )
      ) : (
        <div className="o-banner info">Signed before copies were saved. The text below is version {c.version} of the document.</div>
      )}
      {c.doc ? <LegalText doc={c.doc} /> : <p className="o-empty">The text of version {c.version} is not available.</p>}
    </div>
  );
}
