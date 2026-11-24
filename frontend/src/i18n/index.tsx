import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import ar from "./ar.json";
import en from "./en.json";

export type Lang = "ar" | "en";
export type Key = keyof typeof en;
type Params = Record<string, unknown>;

const texts: Record<Lang, Record<string, string>> = { ar, en };

function translate(lang: Lang, key: string, params: Params = {}): string | undefined {
  return texts[lang][key]?.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: Key, params?: Params) => string;
  /** Message for a backend error code. */
  errorText: (error: unknown) => string;
}

const Context = createContext<I18n | null>(null);

export function I18nProvider({
  children,
  initial = "ar",
}: {
  children: ReactNode;
  initial?: Lang;
}) {
  const [lang, setLang] = useState<Lang>(initial);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params) ?? key,
      errorText: (error) => {
        const { code, params } = error as { code?: string; params?: Params };
        return (
          translate(lang, `error.${code}`, params) ??
          translate(lang, "error.internal_error") ??
          "error"
        );
      },
    }),
    [lang],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}
