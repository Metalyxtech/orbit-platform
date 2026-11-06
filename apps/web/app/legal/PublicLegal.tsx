import Link from 'next/link';
import type { LegalDocument } from '@/legal/documents';
import { LegalText } from '@/legal/LegalText';

/** Public page for one legal document (no sign-in needed). */
export function PublicLegal({ doc }: { doc: LegalDocument }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--graphite)', padding: '24px 16px' }}>
      <div className="o-panel" style={{ maxWidth: 820, margin: '0 auto', padding: '28px 32px' }}>
        <div className="o-row" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <div className="o-row">
            <div className="o-brand-mark" style={{ borderColor: 'var(--graphite)' }} aria-hidden />
            <strong style={{ fontSize: 18 }}>Orbit</strong>
          </div>
          <span className="o-row" style={{ gap: 12, fontSize: 13 }}>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/">Back to Orbit</Link>
          </span>
        </div>
        <LegalText doc={doc} />
      </div>
    </main>
  );
}
