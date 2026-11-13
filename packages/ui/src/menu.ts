// Menu data shapes and helpers, safe on the server and the client.
/** `icon` is an icon name from Icon.tsx; left out, one is chosen from the label. */
export type MenuLink = { href: string; label: string; badge?: number; icon?: string };
/** A main menu entry: a page, or a drop-down holding related pages. */
export type MenuEntry = MenuLink | { label: string; items: MenuLink[]; icon?: string };
export type MenuSection = { title?: string; entries: MenuEntry[] };

export const isMenu = (e: MenuEntry): e is { label: string; items: MenuLink[]; icon?: string } => 'items' in e;

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

/**
 * The admin part of a sidebar, in two short sections: company-wide pages, then each portal's
 * settings under the portal's name (items carry `group`: 'Company' or the portal name).
 */
export function adminSections<T extends MenuLink & { group?: string }>(items: T[]): MenuSection[] {
  const company = items.filter((n) => !n.group || n.group === 'Company');
  const portals = items.filter((n) => n.group && n.group !== 'Company');
  return [
    { title: 'Company admin', entries: toEntries(company.map((n) => ({ href: n.href, label: n.label, badge: n.badge }))) },
    { title: 'Portal settings', entries: toEntries(portals.map((n) => ({ href: n.href, label: n.label, badge: n.badge, menu: n.group }))) },
  ];
}
