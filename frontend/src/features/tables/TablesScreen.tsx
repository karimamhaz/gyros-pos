import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { formatTime } from "../../shared/format";
import type { MenuGroup, Order } from "../../shared/types";
import { Empty, ErrorNote, Lbp, Ltr, Tag, useAction, useLoad } from "../../shared/ui";
import { TableOrder } from "./TableOrder";

export interface TableState {
  table_no: number;
  state: "free" | "draft" | "open" | "paid";
  due: number;
  opened_at: string | null;
}

export function TablesScreen({ menu }: { menu: MenuGroup[] }) {
  const { t } = useI18n();
  const tables = useLoad(() => api.get<TableState[]>("/tables"));
  const [order, setOrder] = useState<Order | null>(null);
  const { busy, error, run } = useAction();

  const open = (no: number) =>
    run(async () => setOrder(await api.post<Order>(`/tables/${no}/order`)));

  if (order) {
    return (
      <TableOrder
        key={order.id}
        menu={menu}
        initial={order}
        onOther={setOrder}
        onBack={() => {
          setOrder(null);
          void tables.reload();
        }}
      />
    );
  }
  const count = (state: string) => tables.data?.filter((x) => x.state === state).length ?? 0;
  return (
    <main className="page">
      <div className="line">
        <h1>{t("tab.tables")}</h1>
        <div className="flex gap-2">
          <Tag>{t("tables.free", { count: count("free") + count("draft") })}</Tag>
          <Tag>{t("tables.open", { count: count("open") })}</Tag>
          <Tag tone="good">{t("tables.paid", { count: count("paid") })}</Tag>
        </div>
      </div>
      <ErrorNote error={error ?? tables.error} />
      {tables.data?.length === 0 && <Empty>{t("tables.none")}</Empty>}
      <div className="tables scroll">
        {tables.data?.map((x) => (
          <button
            type="button"
            key={x.table_no}
            className={`table-tile ${x.state}`}
            disabled={busy}
            onClick={() => open(x.table_no)}
          >
            <span className="line">
              <strong>{x.table_no}</strong>
              {x.opened_at && (
                <small>
                  <Ltr>{formatTime(x.opened_at)}</Ltr>
                </small>
              )}
            </span>
            <span>
              {x.state === "open" ? (
                <b>
                  <Lbp value={x.due} />
                </b>
              ) : (
                <b className={x.state === "paid" ? "text-good" : "soft"}>
                  {t(`tables.state.${x.state}`)}
                </b>
              )}
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
