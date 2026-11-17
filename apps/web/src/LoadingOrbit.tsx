/**
 * Full-page "Loading Orbit…" shown at once while the server prepares a page (sign-in, company
 * choice, first load after a quiet spell). Without it the browser shows an empty page meanwhile.
 */
export function LoadingOrbit({ label = 'Loading Orbit…' }: { label?: string }) {
  return (
    <div className="o-state" aria-busy="true">
      <div>
        <div className="o-brand-mark dark o-loading-mark" aria-hidden />
        <p className="muted">{label}</p>
      </div>
    </div>
  );
}
