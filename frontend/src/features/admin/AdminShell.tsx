import { useState } from "react";
import { LanguageButton } from "../../app/LanguageButton";
import { useSession } from "../../app/session";
import logo from "../../assets/logo.png";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { ShiftState } from "../../shared/types";
import { Button, Dialog, ErrorNote, Field, useAction, useLoad } from "../../shared/ui";
import { EndShift } from "../shift/EndShift";
import { BackupsPage } from "./BackupsPage";
import { CashiersPage } from "./CashiersPage";
import { ExpensesPage } from "./ExpensesPage";
import { InventoryPage } from "./InventoryPage";
import { OrdersPage } from "./OrdersPage";
import { PrinterPage } from "./PrinterPage";
import { ProductsPage } from "./ProductsPage";
import { PromosPage } from "./PromosPage";
import { SalesPage } from "./SalesPage";
import { SettingsPage } from "./SettingsPage";
import { ShiftsPage } from "./ShiftsPage";

const PAGES = [
  "sales",
  "orders",
  "products",
  "promos",
  "shifts",
  "cashiers",
  "inventory",
  "expenses",
  "printer",
  "settings",
  "backups",
] as const;
type Page = (typeof PAGES)[number];

interface Props {
  shift: ShiftState;
  reloadShift: () => Promise<void>;
  onSell: () => void;
}

export function AdminShell({ shift, reloadShift, onSell }: Props) {
  const { t } = useI18n();
  const { settings } = useSession();
  const [page, setPage] = useState<Page>("sales");
  const [leaving, setLeaving] = useState(false);
  const alerts = useLoad(
    () => api.get<{ backup_failed: boolean; clock_behind: boolean }>("/reports/alerts"),
    page,
  );
  const pages = PAGES.filter(
    (p) =>
      (p !== "inventory" || settings.inventory_enabled) &&
      (p !== "expenses" || settings.expenses_enabled),
  );

  return (
    <div className="admin">
      <nav className="side">
        <img src={logo} alt="Gyros" width={150} />
        {pages.map((p) => (
          <button
            type="button"
            key={p}
            className={p === page ? "on" : ""}
            aria-current={p === page ? "page" : undefined}
            onClick={() => setPage(p)}
          >
            {t(`admin.${p}`)}
          </button>
        ))}
        <div className="bottom">
          <button type="button" onClick={onSell}>
            {t("admin.sell")}
          </button>
          <LanguageButton className="" />
          <button type="button" onClick={() => setLeaving(true)}>
            {t("logout")}
          </button>
        </div>
      </nav>
      <main className="page admin-page">
        {alerts.data?.backup_failed && <div className="error-note">{t("alert.backup")}</div>}
        {alerts.data?.clock_behind && <div className="error-note">{t("alert.clock")}</div>}
        {page === "sales" && <SalesPage />}
        {page === "orders" && <OrdersPage />}
        {page === "products" && <ProductsPage />}
        {page === "promos" && <PromosPage />}
        {page === "shifts" && <ShiftsPage current={shift} reloadCurrent={reloadShift} />}
        {page === "cashiers" && <CashiersPage />}
        {page === "inventory" && <InventoryPage />}
        {page === "expenses" && <ExpensesPage />}
        {page === "printer" && <PrinterPage />}
        {page === "settings" && <SettingsPage />}
        {page === "backups" && <BackupsPage />}
      </main>
      {leaving &&
        (shift.mine ? (
          <EndShift shift={shift} tables={0} deliveries={0} onClose={() => setLeaving(false)} />
        ) : (
          <LogoutDialog onClose={() => setLeaving(false)} />
        ))}
    </div>
  );
}

function LogoutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { leave } = useSession();
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();
  const logout = () =>
    run(async () => {
      await api.post("/auth/logout", { password });
      leave();
    });
  return (
    <Dialog title={t("logout")} onClose={busy ? undefined : onClose}>
      <Field
        label={t("password.own")}
        kind="latin"
        password
        autoFocus
        value={password}
        onChange={setPassword}
        onEnter={logout}
      />
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button size="l" disabled={busy} onClick={onClose}>
          {t("back")}
        </Button>
        <Button
          variant="primary"
          size="l"
          className="flex-1"
          disabled={busy || !password}
          onClick={logout}
        >
          {t("logout")}
        </Button>
      </div>
    </Dialog>
  );
}
