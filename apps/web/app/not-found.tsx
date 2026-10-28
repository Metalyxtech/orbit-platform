import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="o-page" style={{ maxWidth: 480, margin: '80px auto' }}>
      <h1>Page not found</h1>
      <p className="muted">The page does not exist or you do not have access to it.</p>
      <Link className="o-btn" href="/">
        Go to Orbit
      </Link>
    </div>
  );
}
