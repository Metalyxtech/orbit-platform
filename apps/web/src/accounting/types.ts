import type { AcctDoc } from '@orbit/core/accounting';

// What every online accounts connector (Zoho Books, QuickBooks Online, Xero) provides. Tally works
// with files instead (tally.ts).

export type OnlineProvider = 'zoho' | 'quickbooks' | 'xero';
export type Provider = OnlineProvider | 'tally';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** Where this company's API lives (Zoho data centre). */
  apiBase?: string | null;
}

export interface Org {
  id: string;
  name: string;
}

/** A connection with its tokens decrypted, ready to call the provider. */
export interface Conn extends Tokens {
  id: string;
  provider: OnlineProvider;
  orgId: string;
  orgName: string | null;
  settings: Record<string, unknown>;
}

export interface Choice {
  value: string;
  label: string;
}

/** One dropdown on the Accounting page, filled from the company's own accounts software. */
export interface OptionField {
  key: string;
  label: string;
  help: string;
  for: 'sales' | 'purchase';
  required: boolean;
  choices: Choice[];
}

export interface OnlineConnector {
  id: OnlineProvider;
  name: string;
  /** The provider's sign-in page for this company. */
  authorizeUrl(clientId: string, state: string, redirectUri: string): string;
  /** Finish sign-in: tokens and the organisations this login can use. */
  exchange(keys: Keys, params: URLSearchParams, redirectUri: string): Promise<{ tokens: Tokens; orgs: Org[] }>;
  refresh(keys: Keys, conn: Conn): Promise<Tokens>;
  /** Accounts, items and taxes to pick on the Accounting page. */
  options(conn: Conn): Promise<OptionField[]>;
  /** Creates the invoice or bill (and the customer or supplier when new). Returns its id there. */
  push(conn: Conn, doc: AcctDoc): Promise<string>;
}

export interface Keys {
  clientId: string;
  clientSecret: string;
}

/** An error from the accounts software, worded for the person reading it. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly reconnect = false,
  ) {
    super(message);
  }
}

/** fetch + JSON with a readable error. `who` names the provider in messages. */
export async function call<T>(who: string, url: string, init: RequestInit, pick: (body: unknown) => string | undefined = () => undefined): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ProviderError(`${who} did not answer. Try again in a minute.`);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (res.status === 401) throw new ProviderError(`${who} signed SteelConnect360 out. Reconnect ${who} on the Accounting page.`, true);
  if (!res.ok) {
    const said = pick(body);
    throw new ProviderError(`${who} refused it${said ? `: ${said}` : ` (error ${res.status})`}`);
  }
  return body as T;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const str = (s: Record<string, unknown>, k: string) => (typeof s[k] === 'string' && (s[k] as string).trim() ? (s[k] as string).trim() : undefined);
