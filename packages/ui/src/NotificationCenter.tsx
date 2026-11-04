"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type NoticeItem = {
  id: string;
  portal: string;
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
};

const SEEN = "orbit-seen-tasks";
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? "[]");
  } catch {
    return [];
  }
};
const writeSeen = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
};

/**
 * Bell with everything waiting for you, across every portal. New items pop up on their own;
 * "Got it" hides them, and an item leaves the list as soon as the task is done.
 */
export function NotificationCenter({
  endpoint = "/api/inbox",
}: {
  endpoint?: string;
}) {
  const path = usePathname();
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [fresh, setFresh] = useState<NoticeItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: NoticeItem[] };
      setItems(data.items);
      const ids = data.items.map((i) => i.id);
      const seen = readSeen().filter((id) => ids.includes(id)); // forget tasks that are done
      writeSeen(seen);
      setFresh(data.items.filter((i) => !seen.includes(i.id)));
    } catch {
      /* offline: keep what we have */
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load, path]);
  useEffect(() => {
    const t = setInterval(() => void load(), 45000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const gotIt = () => {
    writeSeen([...new Set([...readSeen(), ...items.map((i) => i.id)])]);
    setFresh([]);
  };
  const list = (rows: NoticeItem[]) => (
    <ul className="o-notes">
      {rows.map((i) => (
        <li key={i.id} className={i.urgent ? "urgent" : undefined}>
          <Link
            href={i.href}
            onClick={() => {
              writeSeen([...new Set([...readSeen(), i.id])]);
              setFresh((f) => f.filter((x) => x.id !== i.id));
              setOpen(false);
            }}
          >
            <span className="o-note-portal">{i.portal}</span>
            <strong>{i.title}</strong>
            <span>{i.detail}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  const showPopup = !open && fresh.length > 0;
  // Pop-ups go to <body> so the sidebar's stacking context cannot hide them behind the page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const layer = (node: ReactNode) =>
    mounted ? createPortal(node, document.body) : null;
  return (
    <>
      <button
        type="button"
        className="o-bell"
        aria-label={`${items.length} waiting for you`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {items.length > 0 && (
          <span className="o-bell-n">
            {items.length > 99 ? "99+" : items.length}
          </span>
        )}
      </button>
      {open &&
        layer(
          <div className="o-notice" role="dialog" aria-label="Waiting for you">
            <div className="o-notice-head">
              <strong>Waiting for you</strong>
              <button
                type="button"
                className="o-btn small"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            {items.length ? (
              list(items)
            ) : (
              <p className="o-notice-empty">
                Nothing waiting. You are up to date.
              </p>
            )}
          </div>,
        )}
      {showPopup &&
        layer(
          <div className="o-notice pop" role="status" aria-live="polite">
            <div className="o-notice-head">
              <strong>
                {fresh.length} new {fresh.length === 1 ? "task" : "tasks"} for
                you
              </strong>
              <button type="button" className="o-btn small" onClick={gotIt}>
                Got it
              </button>
            </div>
            {list(fresh.slice(0, 5))}
            {fresh.length > 5 && (
              <button
                type="button"
                className="o-notice-more"
                onClick={() => setOpen(true)}
              >
                See all {fresh.length}
              </button>
            )}
          </div>,
        )}
    </>
  );
}
