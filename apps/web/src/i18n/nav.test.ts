import { describe, expect, it } from 'vitest';
import { LANG_CODES, translationProblems } from '@orbit/core/i18n';
import { hrManifest } from '@orbit/portal-hr/manifest';
import { productionManifest } from '@orbit/portal-production/manifest';
import { timesheetManifest } from '@orbit/portal-timesheet/manifest';
import { NAV_EN, NAV_TRANSLATIONS, navLabel } from './nav';

describe('menu translations', () => {
  it('keep placeholders, use known labels and cover every language', () => {
    expect(translationProblems(NAV_EN, NAV_TRANSLATIONS)).toEqual([]);
    for (const lang of LANG_CODES.filter((l) => l !== 'en')) {
      const own = NAV_TRANSLATIONS[lang as keyof typeof NAV_TRANSLATIONS] ?? {};
      expect({ lang, missing: Object.keys(NAV_EN).filter((k) => !(k in own)) }).toEqual({ lang, missing: [] });
    }
  });

  it('cover every main menu item of Timesheet, Production and HR', () => {
    const labels = [timesheetManifest, productionManifest, hrManifest].flatMap((m) => m.nav.filter((n) => n.section === 'main').flatMap((n) => [n.label, ...(n.menu ? [n.menu] : [])]));
    expect(labels.filter((l) => !(l in NAV_EN))).toEqual([]);
  });

  it('leaves unknown labels as they are', () => {
    expect(navLabel('hi')('My week')).toBe('मेरा सप्ताह');
    expect(navLabel('hi')('Timesheet settings')).toBe('Timesheet settings');
  });
});
