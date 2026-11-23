import { useState } from "react";
import { useI18n, type Key } from "../../i18n";
import { api } from "../../shared/api";
import { formatDate, formatTime } from "../../shared/format";
import type { Order, OrderType } from "../../shared/types";
import { ApprovalDialog } from "../../shared/ApprovalForm";
import {
  Button,
  Dialog,
  Empty,
  ErrorNote,
  Lbp,
  Ltr,
  Table,
  Tag,
  useAction,
  useLoad,
} from "../../shared/ui";
import { OrderDetails } from "../find/OrderDetails";
import { RefundDialog } from "../find/RefundDialog";
import { PrintStatus } from "../printing/PrintStatus";
import { DateField } from "./DateField";
import { Head } from "./Head";

interface Row {
  id: string;
  number: number;
  business_date: string;
  confirmed_at: string;
  type: OrderType;
  table_no: number | null;
  cashier: string;
  total: number;
  state: Order["state"];
  payment_state: Order["payment_state"];
}
const TONE = { paid: "good", unpaid: "bad", partial: "warn", refunded: "" } as const;
const STATES = ["unpaid", "completed", "cancelled", "refunded"] as const;

export function OrdersPage() {
  const { t } = useI18n();
  const [day, setDay] = useState("");
  const [state, setState] = useState("");
  const [open, setOpen] = useState<Order | null>(null);
  const query = new URLSearchParams();
  if (day) query.set("day", day);
  if (state) query.set("state", state);
  const key = query.toString();
  const orders = useLoad(() => api.get<Row[]>(`/orders?${key}`), key);
  const { error, run } = useAction();

  return (
    <>
      <Head title={t("admin.orders")}>
        <select
          className="pick"
          aria-label={t("filter.states")}
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">{t("filter.states")}</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {t(`orders.state.${s}` as Key)}
            </option>
          ))}
        </select>
        <div className="w-[190px] bare">
          <DateField label={t("day")} value={day} onChange={setDay} />
        </div>
        {day && <Button onClick={() => setDay("")}>{t("all_days")}</Button>}
      </Head>
      <ErrorNote error={error ?? orders.error} />
      {orders.data?.length === 0 && <Empty>{t("orders.none")}</Empty>}
      {!!orders.data?.length && (
        <Table
          head={[
            t("number"),
            t("day"),
            t("time"),
            t("type"),
            t("role.cashier"),
            t("total"),
            t("status"),
            "",
          ]}
        >
          {orders.data.map((o) => (
            <tr key={o.id}>
              <td>
                <b>{o.number}</b>
              </td>
              <td>
                <Ltr>{formatDate(o.business_date)}</Ltr>
              </td>
              <td>
                <Ltr>{formatTime(o.confirmed_at)}</Ltr>
              </td>
              <td>
                {t(`type.${o.type}`)} {o.table_no ?? ""}
              </td>
              <td>
                <bdi>{o.cashier}</bdi>
              </td>
              <td>
                <b>
                  <Lbp value={o.total} />
                </b>
              </td>
              <td>
                <Tag tone={o.state === "cancelled" ? "" : TONE[o.payment_state]}>
                  {t(o.state === "cancelled" ? "state.cancelled" : `state.${o.payment_state}`)}
                </Tag>
              </td>
              <td>
                <Button
                  size="s"
                  onClick={() => run(async () => setOpen(await api.get<Order>(`/orders/${o.id}`)))}
                >
                  {t("view")}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {open && (
        <OrderDialog
          order={open}
          onChange={setOpen}
          onClose={() => {
            setOpen(null);
            void orders.reload();
          }}
        />
      )}
    </>
  );
}

function OrderDialog({
  order,
  onChange,
  onClose,
}: {
  order: Order;
  onChange: (order: Order) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [job, setJob] = useState<string | null>(null);
  const [asking, setAsking] = useState<"refund" | "cancel" | null>(null);
  const { busy, error, run } = useAction();
  const refundable = order.state === "completed" || (order.state === "confirmed" && order.paid > 0);

  if (asking === "refund") {
    return (
      <RefundDialog
        order={order}
        code=""
        onClose={() => setAsking(null)}
        onDone={(next) => {
          onChange(next);
          setAsking(null);
        }}
      />
    );
  }
  if (asking === "cancel") {
    return (
      <ApprovalDialog
        title={t("order.cancel_saved")}
        onClose={() => setAsking(null)}
        onApprove={async (approval) => {
          const body = { version: order.version, approval };
          onChange(await api.post<Order>(`/orders/${order.id}/cancel`, body));
          setAsking(null);
        }}
      />
    );
  }
  return (
    <Dialog title={t("order")} onClose={onClose}>
      <OrderDetails order={order} />
      <ErrorNote error={error} />
      {job && <PrintStatus key={job} job={job} />}
      <div className="flex gap-2">
        <Button onClick={onClose}>{t("back")}</Button>
        <Button
          variant="dark"
          className="flex-1"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const path = `/print/orders/${order.id}/reprint`;
              setJob((await api.post<{ job: string }>(path, {})).job);
            })
          }
        >
          {t("find.reprint")}
        </Button>
        {refundable && (
          <Button variant="danger" onClick={() => setAsking("refund")}>
            {t("refund")}
          </Button>
        )}
        {order.state === "confirmed" && order.paid === 0 && (
          <Button variant="danger" onClick={() => setAsking("cancel")}>
            {t("order.cancel_saved")}
          </Button>
        )}
      </div>
      {(refundable || order.state === "confirmed") && (
        <p className="soft text-sm">{t("orders.needs_shift")}</p>
      )}
    </Dialog>
  );
}
