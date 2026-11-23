import logo from "../assets/logo.png";
import { useI18n } from "../i18n";
import { api } from "../shared/api";
import { ErrorNote, useLoad } from "../shared/ui";

export function App() {
  const { t, lang, setLang } = useI18n();
  const health = useLoad(() => api.get<{ status: string }>("/health"));
  return (
    <div className="screen dark">
      <button className="corner" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
        {t("language.other")}
      </button>
      <img src={logo} alt="Gyros" width={470} />
      <p>{health.data ? t("app.ready") : t("app.starting")}</p>
      <ErrorNote error={health.error} />
    </div>
  );
}
