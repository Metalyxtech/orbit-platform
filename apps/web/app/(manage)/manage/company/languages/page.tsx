import { redirect } from 'next/navigation';
import { LANGUAGES } from '@orbit/core/i18n';
import { companyLanguages } from '@orbit/core/i18n-store';
import { getSession, query } from '@orbit/core/next';
import { LanguagesClient } from './LanguagesClient';

export const dynamic = 'force-dynamic';

/** Company admin > Languages: which languages people can use, and the default for new people. */
export default async function Languages() {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const offered = await query((tx, ctx) => companyLanguages(tx, ctx.companyId));
  return (
    <>
      <header className="o-top">
        <strong>Languages</strong>
      </header>
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Languages</h1>
            <p>
              Choose the languages your people can use. Each person then picks theirs at the bottom of the menu. Timesheet entry, the roster, overtime requests and the
              daily production report appear in their language; names, numbers and what people type are saved as entered.
            </p>
          </div>
        </div>
        <LanguagesClient all={LANGUAGES.map((l) => ({ code: l.code, name: l.name, native: l.native, rtl: l.dir === 'rtl' }))} offered={offered} />
      </div>
    </>
  );
}
