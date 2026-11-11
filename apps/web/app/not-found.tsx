import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="o-state">
      <div>
        <div className="o-brand-mark dark" aria-hidden />
        <span className="code">Error 404</span>
        <h1>Page not found</h1>
        <p>The page does not exist or you do not have access to it.</p>
        <Link className="o-btn primary" href="/">
          Go to Orbit
        </Link>
      </div>
    </div>
  );
}
