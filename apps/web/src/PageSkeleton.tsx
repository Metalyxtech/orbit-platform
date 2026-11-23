/**
 * Shown instantly while a page loads (Next.js loading.tsx): the menu stays, the page area shows
 * a light placeholder, so a click always answers at once.
 */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <header className="o-top">
        <span className="o-skel" style={{ width: 160, height: 14 }} />
      </header>
      <div className="o-page">
        <div className="o-skel" style={{ width: 260, height: 22 }} />
        <div className="o-row" style={{ gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="o-skel" style={{ flex: 1, height: 72 }} />
          ))}
        </div>
        <div className="o-skel" style={{ height: 220 }} />
        <div className="o-skel" style={{ height: 140 }} />
      </div>
    </div>
  );
}
