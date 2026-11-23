import { useI18n } from "../i18n";

export function LanguageButton({ className }: { className: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <button
      type="button"
      className={className}
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
    >
      {t("language.other")}
    </button>
  );
}
