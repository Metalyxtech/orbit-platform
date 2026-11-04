// Menu data shapes and helpers, safe on the server and the client.
export type MenuLink = { href: string; label: string; badge?: number };
/** A main menu entry: a page, or a drop-down holding related pages. */
export type MenuEntry = MenuLink | { label: string; items: MenuLink[] };
export type MenuSection = { title?: string; entries: MenuEntry[] };

export const isMenu = (e: MenuEntry): e is { label: string; items: MenuLink[] } => 'items' in e;

/** Groups flat items into main-menu entries: items with the same `menu` go into one drop-down. */
export function toEntries<T extends MenuLink & { menu?: string }>(items: T[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const it of items) {
    if (!it.menu) {
      out.push({ href: it.href, label: it.label, badge: it.badge });
      continue;
    }
    const existing = out.find((e) => isMenu(e) && e.label === it.menu) as { label: string; items: MenuLink[] } | undefined;
    const l = { href: it.href, label: it.label, badge: it.badge };
    if (existing) existing.items.push(l);
    else out.push({ label: it.menu, items: [l] });
  }
  // A drop-down with a single page is just that page.
  return out.map((e) => (isMenu(e) && e.items.length === 1 ? e.items[0] : e));
}
