import { describe, expect, it } from 'vitest';
import { dayName, isLang, LANGUAGE_REGIONS, LANGUAGES, translationProblems, translator } from '../src/i18n';

describe('translator', () => {
  const en = { hello: 'Hello {name}', bye: 'Bye' };
  const t = translator(en, { hi: { hello: 'नमस्ते {name}' } }, 'hi');

  it('translates and fills placeholders', () => {
    expect(t('hello', { name: 'Ravi' })).toBe('नमस्ते Ravi');
  });

  it('falls back to English for a missing string or language', () => {
    expect(t('bye')).toBe('Bye');
    expect(translator(en, {}, 'ta')('hello', { name: 'A' })).toBe('Hello A');
  });

  it('finds broken placeholders and unknown keys', () => {
    expect(translationProblems(en, { fr: { hello: 'Bonjour', extra: 'x' } as never })).toEqual(['fr.hello: placeholders  should be name', 'fr.extra: not in English']);
  });

  it('offers 25 languages, Urdu and Arabic right to left', () => {
    expect(LANGUAGES).toHaveLength(25);
    expect(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code)).toEqual(['ur', 'ar']);
    expect(isLang('hi')).toBe(true);
    expect(isLang('xx')).toBe(false);
  });

  it('lists every language exactly once across the regions', () => {
    const listed = LANGUAGE_REGIONS.flatMap((r) => r.codes);
    expect(listed.length).toBe(new Set(listed).size);
    expect([...listed].sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  it('names days in the language', () => {
    expect(dayName('de', '2026-12-07', 'long')).toBe('Montag');
    expect(dayName('fr', '2026-12-07', 'long')).toBe('lundi');
  });
});
