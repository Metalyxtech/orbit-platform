import { describe, expect, it } from 'vitest';
import { LANG_CODES, translationProblems } from '@orbit/core/i18n';
import { TS_EN, TS_TRANSLATIONS, tsT } from './i18n';

describe('timesheet translations', () => {
  it('keep every placeholder and only use known keys', () => {
    expect(translationProblems(TS_EN, TS_TRANSLATIONS)).toEqual([]);
  });

  it('cover every language completely', () => {
    for (const lang of LANG_CODES.filter((l) => l !== 'en')) {
      const missing = Object.keys(TS_EN).filter((k) => !(k in (TS_TRANSLATIONS[lang as keyof typeof TS_TRANSLATIONS] ?? {})));
      expect({ lang, missing }).toEqual({ lang, missing: [] });
    }
  });

  it('fills values in the person language', () => {
    expect(tsT('hi')('submitWeek', { n: 49 })).toBe('सप्ताह 49 जमा करें');
    expect(tsT('de')('confirmBody', { total: '45.0', ot: '5.0' })).toBe('45.0 Std., davon 5.0 Std. Überstunden.');
  });
});
