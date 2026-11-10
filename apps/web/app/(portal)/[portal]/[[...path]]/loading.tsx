/** Shown while a portal screen loads its data, so navigation responds at once. */
export default function Loading() {
  return (
    <>
      <header className="o-top" aria-hidden>
        <div className="o-skel" style={{ width: 180, height: 14 }} />
      </header>
      <div className="o-page" aria-busy="true" aria-label="Loading">
        <div className="o-skel" style={{ width: 260, height: 28 }} />
        <div className="o-skel" style={{ height: 84 }} />
        <div className="o-skel" style={{ height: 320 }} />
      </div>
    </>
  );
}
