import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { MenuGroup, Order, OrderItem } from "../../shared/types";
import { ApprovalDialog } from "../../shared/ApprovalForm";
import { Button, Dialog, ErrorNote, Lbp, Tag, useAction } from "../../shared/ui";
import { RefundDialog } from "../find/RefundDialog";
import { MenuGrid } from "../order/MenuGrid";
import { PromoField } from "../order/PromoField";
import { DraftLines, SavedLines, Totals } from "../order/Ticket";
import { useDraft } from "../order/useDraft";
import { PaymentScreen } from "../payment/PaymentScreen";
import { PrintStatus } from "../printing/PrintStatus";

interface Props {
  menu: MenuGroup[];
  initial: Order;
  /** Another bill of the same table, after this one was paid or cancelled. */
  onOther: (order: Order) => void;
  onBack: () => void;
}

type Asking = "cancel" | "refund" | "close" | { void: OrderItem } | null;

export function TableOrder({ menu, initial, onOther, onBack }: Props) {
  const { t } = useI18n();
  const draft = useDraft(initial);
  const [paying, setPaying] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const [billJob, setBillJob] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const { busy, error, run } = useAction();
  const order = draft.order!;
  const no = order.table_no!;
  const saved = order.state === "confirmed";
  const hasNew = draft.lines.length > 0;
  const ready = draft.settled && !busy;

  const nextBill = async () => onOther(await api.post<Order>(`/tables/${no}/order`));
  const save = async (): Promise<Order> => {
    const body = { version: order.version, expected_total: order.total };
    const next = await api.post<Order>(`/orders/${order.id}/confirm`, body);
    draft.reset(next);
    return next;
  };
  const closeTable = async (approval?: { reason: string; password: string }) => {
    await api.post(`/tables/${no}/close`, { approval: approval ?? null });
    onBack();
  };

  if (paying) {
    return (
      <PaymentScreen
        order={order}
        onBack={async () => {
          draft.reset(await api.get<Order>(`/orders/${order.id}`).catch(() => order));
          setPaying(false);
        }}
        onDone={async (paid) => {
          setPaying(false);
          if (paid.state === "completed") await nextBill().catch(onBack);
          else draft.reset(paid);
        }}
      />
    );
  }

  const quantities: Record<string, number> = {};
  for (const l of draft.lines) quantities[l.product_id] = (quantities[l.product_id] ?? 0) + l.qty;

  return (
    <div className="order">
      <div className="work">
        <div className="line">
          <h1>{t("table.title", { no })}</h1>
          <Button onClick={onBack}>{t("table.all")}</Button>
        </div>
        <MenuGrid menu={menu} quantities={quantities} onPick={draft.add} />
      </div>
      <aside className="ticket">
        <div className="ticket-head line">
          <h2>{t(saved ? "table.bill" : "table.new_bill")}</h2>
          {saved && <Tag tone="bad">{t(`state.${order.payment_state}`)}</Tag>}
        </div>
        <div className="scroll flex-1">
          {saved && (
            <>
              <div className="group-label">{t("table.saved")}</div>
              <SavedLines
                items={order.items}
                onVoid={(item) => {
                  setQty(1);
                  setAsking({ void: item });
                }}
              />
            </>
          )}
          {hasNew && <div className="group-label">{t("table.new")}</div>}
          <DraftLines draft={draft} />
          {!saved && !hasNew && <p className="soft p-6 text-center">{t("order.empty")}</p>}
        </div>
        <div className="ticket-foot">
          <PromoField
            order={saved || hasNew ? order : null}
            disabled={!draft.settled}
            onChange={draft.accept}
          />
          <Totals order={order} pending={!draft.settled} />
          <ErrorNote error={draft.error ?? error} />
          {draft.error !== null && (
            <Button size="s" onClick={() => void draft.flush()}>
              {t("retry")}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="dark"
              className="flex-1"
              disabled={!ready || !hasNew}
              onClick={() => run(save)}
            >
              {t("table.save")}
            </Button>
            <Button
              disabled={!ready || (!saved && !hasNew)}
              onClick={() =>
                run(async () => {
                  const current = hasNew ? await save() : order;
                  const path = `/print/orders/${current.id}/bill`;
                  setBillJob((await api.post<{ job: string }>(path)).job);
                })
              }
            >
              {t("table.print_bill")}
            </Button>
          </div>
          <Button
            variant="primary"
            size="l"
            disabled={!ready || (!saved && !hasNew)}
            onClick={() => setPaying(true)}
          >
            {t("pay")}
          </Button>
          <div className="flex gap-2">
            {saved && (
              <Button
                size="s"
                variant="danger"
                disabled={!ready}
                onClick={() => setAsking(order.paid ? "refund" : "cancel")}
              >
                {t(order.paid ? "refund" : "order.cancel_saved")}
              </Button>
            )}
            <Button
              size="s"
              className="flex-1"
              disabled={!ready || hasNew}
              onClick={() =>
                saved && order.due > 0 ? setAsking("close") : run(() => closeTable())
              }
            >
              {t("table.close")}
            </Button>
          </div>
        </div>
      </aside>

      {billJob && (
        <Dialog title={t("table.print_bill")} onClose={() => setBillJob(null)}>
          <PrintStatus job={billJob} />
          <Button onClick={() => setBillJob(null)}>{t("back")}</Button>
        </Dialog>
      )}
      {asking === "refund" && (
        <RefundDialog
          order={order}
          code=""
          onClose={() => setAsking(null)}
          onDone={() => void nextBill().catch(onBack)}
        />
      )}
      {asking === "cancel" && (
        <ApprovalDialog
          title={t("order.cancel_saved")}
          onClose={() => setAsking(null)}
          onApprove={async (approval) => {
            const body = { version: order.version, approval };
            await api.post(`/orders/${order.id}/cancel`, body);
            await nextBill();
          }}
        >
          <p>
            {t("order.number", { number: order.number })}, <Lbp value={order.total} />
          </p>
        </ApprovalDialog>
      )}
      {asking === "close" && (
        <ApprovalDialog
          title={t("table.close_unpaid")}
          onClose={() => setAsking(null)}
          onApprove={closeTable}
        >
          <p>
            {t("table.owes")} <Lbp value={order.due} />
          </p>
        </ApprovalDialog>
      )}
      {asking !== null && typeof asking === "object" && (
        <ApprovalDialog
          title={t("table.void")}
          onClose={() => setAsking(null)}
          onApprove={async (approval) => {
            const path = `/orders/${order.id}/items/${asking.void.id}/void`;
            const next = await api.post<Order>(path, { version: order.version, qty, approval });
            setAsking(null);
            if (next.state === "completed") await nextBill().catch(onBack);
            else draft.accept(next);
          }}
        >
          <div className="line">
            <b>
              <bdi>{asking.void.name}</bdi>
            </b>
            <div className="qty">
              <button
                type="button"
                aria-label="+"
                onClick={() => setQty(Math.min(qty + 1, asking.void.qty))}
              >
                +
              </button>
              <span>{qty}</span>
              <button type="button" aria-label="-" onClick={() => setQty(Math.max(qty - 1, 1))}>
                −
              </button>
            </div>
          </div>
          <p>
            {t("table.void_by")} <Lbp value={asking.void.price * qty} />
          </p>
        </ApprovalDialog>
      )}
    </div>
  );
}
