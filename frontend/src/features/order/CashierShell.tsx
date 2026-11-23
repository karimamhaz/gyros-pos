import { useCallback, useEffect, useState } from "react";
import { LanguageButton } from "../../app/LanguageButton";
import { useSession } from "../../app/session";
import logo from "../../assets/logo.png";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { MenuGroup, Order, ShiftState } from "../../shared/types";
import { ErrorNote, useLoad } from "../../shared/ui";
import { UnpaidDeliveries } from "../delivery/UnpaidDeliveries";
import { FindOrder } from "../find/FindOrder";
import { PrintProblemsButton } from "../printing/PrintProblemsButton";
import { QuickAdmin } from "../quick/QuickAdmin";
import { EndShift } from "../shift/EndShift";
import { TablesScreen, type TableState } from "../tables/TablesScreen";
import { OrderScreen } from "./OrderScreen";

type Tab = "order" | "tables" | "deliveries" | "find";
const TABS: Tab[] = ["order", "tables", "deliveries", "find"];

/** `onAdmin` is set when the Admin is selling and may go back to the Admin pages. */
export function CashierShell({ shift, onAdmin }: { shift: ShiftState; onAdmin?: () => void }) {
  const { t } = useI18n();
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>("order");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [quick, setQuick] = useState(false);
  const [ending, setEnding] = useState(false);
  const menu = useLoad(() => api.get<MenuGroup[]>("/menu"));
  const deliveries = useLoad(() => api.get<Order[]>("/orders/unpaid-deliveries"), tab);
  const tables = useLoad(() => api.get<TableState[]>("/tables"), tab);
  const reloadMenu = menu.reload;
  const reloadDeliveries = deliveries.reload;

  useEffect(() => {
    // Availability and stock can change while the app stays open for days.
    const timer = setInterval(() => void reloadMenu(), 60_000);
    return () => clearInterval(timer);
  }, [reloadMenu]);

  const refresh = useCallback(() => void reloadDeliveries(), [reloadDeliveries]);

  if (quick) {
    return (
      <QuickAdmin
        onClose={() => {
          setQuick(false);
          void menu.reload();
        }}
      />
    );
  }
  return (
    <div className="screen">
      <header className="topbar">
        <img src={logo} alt="Gyros" height={46} style={{ height: 46 }} />
        <nav>
          {TABS.map((name) => (
            <button
              type="button"
              key={name}
              className={tab === name ? "on" : ""}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              {t(`tab.${name}`)}
              {name === "deliveries" && deliveries.data && deliveries.data.length > 0 && (
                <b className="count">{deliveries.data.length}</b>
              )}
            </button>
          ))}
        </nav>
        <PrintProblemsButton watch={tab} />
        <span>
          {t(session.role === "admin" ? "role.admin" : "role.cashier")}: <bdi>{session.name}</bdi>
        </span>
        <LanguageButton className="outline" />
        <button type="button" className="outline" onClick={onAdmin ?? (() => setQuick(true))}>
          {t("role.admin")}
        </button>
        <button type="button" className="outline" onClick={() => setEnding(true)}>
          {t("shift.end")}
        </button>
      </header>
      <ErrorNote error={menu.error} />
      {menu.data && tab === "order" && (
        <OrderScreen
          menu={menu.data}
          draftId={draftId}
          onDraft={setDraftId}
          onDineIn={() => setTab("tables")}
          onSent={refresh}
        />
      )}
      {menu.data && tab === "tables" && <TablesScreen menu={menu.data} />}
      {tab === "deliveries" && (
        <UnpaidDeliveries
          orders={deliveries.data}
          error={deliveries.error}
          reload={deliveries.reload}
        />
      )}
      {tab === "find" && <FindOrder />}
      {ending && (
        <EndShift
          shift={shift}
          tables={tables.data?.filter((x) => x.state === "open" || x.state === "paid").length ?? 0}
          deliveries={deliveries.data?.length ?? 0}
          onClose={() => setEnding(false)}
        />
      )}
    </div>
  );
}
