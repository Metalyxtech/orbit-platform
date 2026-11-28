import { describe, expect, it } from 'vitest';
import { dayName, isLang, LANGUAGES, translationProblems, translator } from '../src/i18n';

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

  it('offers 14 languages, Urdu right to left', () => {
    expect(LANGUAGES).toHaveLength(14);
    expect(LANGUAGES.find((l) => l.code === 'ur')?.dir).toBe('rtl');
    expect(isLang('hi')).toBe(true);
    expect(isLang('xx')).toBe(false);
  });

  it('names days in the language', () => {
    expect(dayName('de', '2026-12-07', 'long')).toBe('Montag');
    expect(dayName('fr', '2026-12-07', 'long')).toBe('lundi');
  });
});
