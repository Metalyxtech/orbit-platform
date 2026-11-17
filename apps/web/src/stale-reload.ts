'use client';

// After a new deploy, a tab opened on the previous version can ask for code files that no
// longer exist ("ChunkLoadError", "Failed to fetch dynamically imported module"). One full
// reload fetches the new version and fixes it. A guard stops reload loops on real errors.

const KEY = 'orbit:stale-reload-at';
const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch|Importing a module script failed|server action|deployment/i;

/** True if the error looks like an old tab talking to a new deploy. */
export const looksStale = (err: unknown) => STALE.test(`${(err as Error)?.name ?? ''} ${(err as Error)?.message ?? String(err)}`);

/** Reloads the page at most once a minute. Returns true when a reload was started. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload once; the next error shows the message instead.
  }
  window.location.reload();
  return true;
}
