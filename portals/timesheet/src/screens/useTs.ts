'use client';
import { useMemo } from 'react';
import { dateLabel, dayName } from '@orbit/core/i18n';
import { useLang } from '@orbit/ui';
import { tsT } from '../i18n';

/** Timesheet words, day names and dates in the person's language (set by the portal layout). */
export function useTs() {
  const lang = useLang();
  return useMemo(() => ({ lang, t: tsT(lang), day: (iso: string) => dayName(lang, iso), date: (iso: string) => dateLabel(lang, iso) }), [lang]);
}
