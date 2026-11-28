import { describe, expect, it } from 'vitest';
import { LANG_CODES, translationProblems } from '@orbit/core/i18n';
import { OP_STATUS, SHIFTS } from './config';
import { PROD_EN, PROD_TRANSLATIONS, TERMS_EN, TERMS_TRANSLATIONS, termT } from './i18n';
import { tradesFor } from './trades';

describe('production translations', () => {
  it('keep every placeholder and only use known keys', () => {
    expect(translationProblems(PROD_EN, PROD_TRANSLATIONS)).toEqual([]);
    expect(translationProblems(TERMS_EN, TERMS_TRANSLATIONS)).toEqual([]);
  });

  it('cover every language completely', () => {
    for (const lang of LANG_CODES.filter((l) => l !== 'en')) {
      const l = lang as keyof typeof PROD_TRANSLATIONS;
      expect({ lang, missing: Object.keys(PROD_EN).filter((k) => !(k in (PROD_TRANSLATIONS[l] ?? {}))) }).toEqual({ lang, missing: [] });
      expect({ lang, missing: Object.keys(TERMS_EN).filter((k) => !(k in (TERMS_TRANSLATIONS[l] ?? {}))) }).toEqual({ lang, missing: [] });
    }
  });

  it('has a translation for every shift, status, machine measure and rejection reason on the shop floor', () => {
    const shown = new Set<string>([...SHIFTS, ...Object.values(OP_STATUS).map((s) => s.label)]);
    for (const trade of tradesFor('production')) for (const m of trade.measures ?? []) [m.label, ...(m.options ?? [])].forEach((x) => shown.add(x));
    expect([...shown].filter((x) => !(x in TERMS_EN))).toEqual([]);
    expect(termT('ta')('Short shot')).toBe('ஷார்ட் ஷாட்');
  });
});
