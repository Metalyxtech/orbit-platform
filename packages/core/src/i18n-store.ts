import { and, eq, isNotNull, notInArray } from 'drizzle-orm';
import { companyProfile, memberPrefs, type Tx } from '@orbit/db';
import { audit } from './audit';
import { DEFAULT_LANG, isLang, LANG_CODES, langInfo, type Lang } from './i18n';
import type { ActionContext, SessionContext } from './session';

// Which languages a company offers (the company admin chooses; the first is the default) and the
// language each person picked. Reads never fail: before migration 0038, everyone gets English.

const missing = (err: unknown) => {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || code === '42703' || /(relation "member_prefs"|column "languages"[^"]*) does not exist/.test(String(err));
};
/** A nested transaction (savepoint): a missing table or column gives the fallback without breaking the caller. */
async function safe<T>(tx: Tx, fn: (sp: Tx) => Promise<T>, fallback: T): Promise<T> {
  try {
    return await tx.transaction((sp) => fn(sp as unknown as Tx));
  } catch (err) {
    if (missing(err)) return fallback;
    throw err;
  }
}

/** Languages Super Admin allows this company to offer. English is always allowed. Null limit = every language. */
export async function allowedLanguages(tx: Tx, companyId: string): Promise<Lang[]> {
  const [row] = await safe(tx, (sp) => sp.select({ allowed: companyProfile.allowedLanguages }).from(companyProfile).where(eq(companyProfile.companyId, companyId)), [] as { allowed: string[] | null }[]);
  const limit = row?.allowed;
  if (!limit) return LANG_CODES;
  return LANG_CODES.filter((l) => l === DEFAULT_LANG || limit.includes(l));
}

/** The company's languages, default first. English is always one of them (the general option). */
export async function companyLanguages(tx: Tx, companyId: string): Promise<Lang[]> {
  const [row] = await safe(tx, (sp) => sp.select({ languages: companyProfile.languages }).from(companyProfile).where(eq(companyProfile.companyId, companyId)), [] as { languages: string[] }[]);
  const allowed = await allowedLanguages(tx, companyId);
  const list = (row?.languages ?? []).filter((l): l is Lang => isLang(l) && allowed.includes(l));
  if (!list.length) return [DEFAULT_LANG];
  return list.includes(DEFAULT_LANG) ? list : [...list, DEFAULT_LANG];
}

/** The language this person sees: their own choice when the company still offers it, else the company default. */
export async function myLanguage(tx: Tx, ctx: Pick<SessionContext, 'companyId' | 'membershipId'>): Promise<Lang> {
  const offered = await companyLanguages(tx, ctx.companyId);
  const [pref] = await safe(tx, (sp) => sp.select({ language: memberPrefs.language }).from(memberPrefs).where(eq(memberPrefs.membershipId, ctx.membershipId)), [] as { language: string | null }[]);
  const mine = pref?.language;
  return isLang(mine) && offered.includes(mine) ? mine : offered[0];
}

/** A person picks their language from the ones the company offers. */
export async function setMyLanguage(tx: Tx, ctx: ActionContext, raw: { language: string }) {
  const offered = await companyLanguages(tx, ctx.companyId);
  if (!isLang(raw.language) || !offered.includes(raw.language)) throw new Error('Your company does not offer that language');
  await tx
    .insert(memberPrefs)
    .values({ membershipId: ctx.membershipId, companyId: ctx.companyId, language: raw.language })
    .onConflictDoUpdate({ target: memberPrefs.membershipId, set: { language: raw.language, updatedAt: new Date() } });
  return { language: raw.language };
}

/** The company admin chooses the languages (default first). People on a removed language move to the default. */
export async function setCompanyLanguages(tx: Tx, ctx: ActionContext, raw: { languages: string[] }) {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can choose languages');
  const allowed = await allowedLanguages(tx, ctx.companyId);
  const asked = [...new Set((raw.languages ?? []).filter(isLang))];
  const refused = asked.filter((l) => !allowed.includes(l));
  if (refused.length) throw new Error(`${refused.map((l) => langInfo(l).name).join(', ')} is not enabled for your company. Ask SteelConnect360 to enable it.`);
  // English always stays available as the general option.
  const list = asked.length ? (asked.includes(DEFAULT_LANG) ? asked : [...asked, DEFAULT_LANG]) : [DEFAULT_LANG];
  const before = await companyLanguages(tx, ctx.companyId);
  await tx
    .insert(companyProfile)
    .values({ companyId: ctx.companyId, languages: list })
    .onConflictDoUpdate({ target: companyProfile.companyId, set: { languages: list, updatedAt: new Date() } });
  await tx
    .update(memberPrefs)
    .set({ language: null, updatedAt: new Date() })
    .where(and(eq(memberPrefs.companyId, ctx.companyId), isNotNull(memberPrefs.language), notInArray(memberPrefs.language, list)));
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'company.languages',
    entity: 'company_profile',
    data: { summary: [`Languages: ${before.map((l) => langInfo(l).name).join(', ')} → ${list.map((l) => langInfo(l).name).join(', ')}`, `Default: ${langInfo(list[0]).name}`] },
    requestId: ctx.requestId,
  });
  return { languages: list };
}

/**
 * Super Admin sets which languages a company may offer (null = every language). Languages taken
 * away are removed from the company's list, and people using them move to the company default.
 */
export async function setAllowedLanguages(tx: Tx, companyId: string, raw: string[] | null) {
  const limit = raw === null ? null : [...new Set([DEFAULT_LANG, ...raw.filter(isLang)])];
  const before = await companyLanguages(tx, companyId);
  await tx
    .insert(companyProfile)
    .values({ companyId, allowedLanguages: limit })
    .onConflictDoUpdate({ target: companyProfile.companyId, set: { allowedLanguages: limit, updatedAt: new Date() } });
  const keep = limit ? before.filter((l) => limit.includes(l)) : before;
  const list = keep.length ? keep : [DEFAULT_LANG];
  await tx.update(companyProfile).set({ languages: list, updatedAt: new Date() }).where(eq(companyProfile.companyId, companyId));
  await tx
    .update(memberPrefs)
    .set({ language: null, updatedAt: new Date() })
    .where(and(eq(memberPrefs.companyId, companyId), isNotNull(memberPrefs.language), notInArray(memberPrefs.language, list)));
  return { allowed: limit, languages: list };
}
