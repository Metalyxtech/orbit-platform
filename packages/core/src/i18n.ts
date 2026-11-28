// Languages people can use SteelConnect360 in, and a small translator. Pure: safe in the browser.
// Each portal keeps its own strings (English first, then one object per language); a missing
// string falls back to English, so a half-translated language still works.

export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', dir: 'ltr', locale: 'en-IN' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr', locale: 'hi-IN' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', dir: 'ltr', locale: 'mr-IN' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', dir: 'ltr', locale: 'gu-IN' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', dir: 'ltr', locale: 'pa-IN' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', dir: 'ltr', locale: 'bn-IN' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', dir: 'ltr', locale: 'or-IN' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', dir: 'ltr', locale: 'ta-IN' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', dir: 'ltr', locale: 'te-IN' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', dir: 'ltr', locale: 'kn-IN' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', dir: 'ltr', locale: 'ml-IN' },
  { code: 'ur', name: 'Urdu', native: 'اردو', dir: 'rtl', locale: 'ur-IN' },
  { code: 'fr', name: 'French', native: 'Français', dir: 'ltr', locale: 'fr-FR' },
  { code: 'de', name: 'German', native: 'Deutsch', dir: 'ltr', locale: 'de-DE' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['code'];
export type LangInfo = (typeof LANGUAGES)[number];
export const DEFAULT_LANG: Lang = 'en';
export const LANG_CODES = LANGUAGES.map((l) => l.code) as Lang[];
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANG_CODES as string[]).includes(v);
export const langInfo = (code: string): LangInfo => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

/** Strings of one screen or portal: English is the source; other languages may leave keys out. */
export type Strings = Record<string, string>;
export type Translations<M extends Strings> = Partial<Record<Exclude<Lang, 'en'>, Partial<M>>>;
export type Vars = Record<string, string | number>;
export type T<M extends Strings> = (key: keyof M & string, vars?: Vars) => string;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** t('key', { name }) in `lang`, falling back to English for anything not translated yet. */
export function translator<M extends Strings>(en: M, others: Translations<M>, lang: string): T<M> {
  const own = lang === 'en' ? undefined : others[lang as Exclude<Lang, 'en'>];
  return (key, vars) => fill(own?.[key] ?? en[key] ?? key, vars);
}

/** Placeholders in a string, for checking that every translation keeps them. */
export const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Day and date names in the person's language, from an ISO date (YYYY-MM-DD). */
/** Dates and numbers use 0-9 in every language, so hours read the same for everyone. */
const fmtLocale = (lang: string) => `${langInfo(lang).locale}-u-nu-latn`;
export function dayName(lang: string, isoDate: string, width: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat(fmtLocale(lang), { weekday: width, timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
}
export function dateLabel(lang: string, isoDate: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(fmtLocale(lang), { ...opts, timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * Problems in a set of translations: keys English does not have, and strings that lost or added a
 * {placeholder}. Used by each portal's tests so a translation can never break a message.
 */
export function translationProblems<M extends Strings>(en: M, others: Translations<M>) {
  const problems: string[] = [];
  for (const [lang, strings] of Object.entries(others) as [string, Partial<M>][]) {
    if (!isLang(lang)) problems.push(`${lang}: not a supported language`);
    for (const [key, text] of Object.entries(strings ?? {})) {
      if (!(key in en)) problems.push(`${lang}.${key}: not in English`);
      else if (placeholders(String(text)).join() !== placeholders(en[key]).join()) problems.push(`${lang}.${key}: placeholders ${placeholders(String(text))} should be ${placeholders(en[key])}`);
      if (!String(text).trim()) problems.push(`${lang}.${key}: empty`);
    }
  }
  return problems;
}

/** How much of each language is translated (0-100), for the Languages page and tests. */
export function coverage<M extends Strings>(en: M, others: Translations<M>) {
  const total = Object.keys(en).length;
  return Object.fromEntries(Object.entries(others).map(([lang, s]) => [lang, Math.round((Object.keys(s ?? {}).filter((k) => k in en).length / total) * 100)]));
}
