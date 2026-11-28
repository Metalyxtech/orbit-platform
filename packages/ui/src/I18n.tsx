'use client';
import { createContext, useContext, type ReactNode } from 'react';

// The person's language for every screen inside a portal. The portal layout sets it; screens read it
// with useLang() and translate with their own strings (@orbit/core/i18n translator).

const LangContext = createContext<string>('en');

export function LanguageProvider({ lang, dir, children }: { lang: string; dir: 'ltr' | 'rtl'; children: ReactNode }) {
  return (
    <LangContext.Provider value={lang}>
      <div lang={lang} dir={dir} className={`o-lang o-lang-${lang}`}>
        {children}
      </div>
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
