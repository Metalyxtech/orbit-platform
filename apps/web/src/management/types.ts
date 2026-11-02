import type { ComponentType } from 'react';
import type { SessionContext } from '@orbit/core';

/** Every management view gets the page's search params (for example ?period=week). */
export type ViewProps = { params?: Record<string, string | undefined> };

/** One portal inside the Management workspace: one sidebar entry, tabs inside it. */
export type ManagementModule = {
  /** Short numbers for the Overview page. */
  headline?: ComponentType;
  tabs: { id: string; label: string; View: ComponentType<ViewProps> }[];
  /** Full pages in the portal itself, shown as buttons (path is relative to the portal). */
  links?: { label: string; path: string }[];
};

/**
 * A Management workspace layout. Every company uses `standard` unless it is given its own
 * (see workspaces.ts), for example a different set of tabs for one company.
 */
export type Workspace = {
  id: string;
  title: string;
  /** Roles that get the full workspace (overview, approvals, portal views). Others only see Messages. */
  roles: SessionContext['role'][];
  /** Portal views by portal id. A portal without one is listed as a plain link to the portal. */
  modules: Record<string, ManagementModule>;
};
