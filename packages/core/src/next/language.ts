import { cache } from 'react';
import { langInfo, type Lang } from '../i18n';
import { companyLanguages, myLanguage } from '../i18n-store';
import { query } from './guard';

/** The signed-in person's language and the company's languages. Read once per request. */
export const currentLanguage = cache(async (): Promise<{ lang: Lang; dir: 'ltr' | 'rtl'; offered: Lang[] }> =>
  query(async (tx, ctx) => {
    const [lang, offered] = await Promise.all([myLanguage(tx, ctx), companyLanguages(tx, ctx.companyId)]);
    return { lang, dir: langInfo(lang).dir, offered };
  }),
);
