import { LanguageButton } from "../../app/LanguageButton";
import logo from "../../assets/logo.png";
import { useI18n } from "../../i18n";
import type { Role } from "../../shared/types";

export function StartScreen({ onPick }: { onPick: (role: Role) => void }) {
  const { t } = useI18n();
  return (
    <div className="screen dark">
      <LanguageButton className="corner" />
      <img src={logo} alt="Gyros" width={470} />
      <div className="flex gap-5 mt-6">
        <button type="button" className="role primary" onClick={() => onPick("cashier")}>
          {t("role.cashier")}
          <span>{t("role.cashier.hint")}</span>
        </button>
        <button type="button" className="role" onClick={() => onPick("admin")}>
          {t("role.admin")}
          <span>{t("role.admin.hint")}</span>
        </button>
      </div>
    </div>
  );
}
