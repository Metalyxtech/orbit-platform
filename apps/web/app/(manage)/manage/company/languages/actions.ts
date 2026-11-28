'use server';
import { setCompanyLanguages } from '@orbit/core/i18n-store';
import { runAction } from '@orbit/core/next';

/** Company admin saves the languages the company offers (default first). */
export async function setCompanyLanguagesAction(input: { languages: string[] }) {
  return runAction((tx, ctx) => setCompanyLanguages(tx, ctx, input));
}
