import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { formatTime } from "../../shared/format";
import type { MenuGroup, Order, OrderType } from "../../shared/types";
import {
  Button,
  Dialog,
  ErrorNote,
  Lbp,
  Ltr,
  Segmented,
  Table,
  useAction,
  useLoad,
} from "../../shared/ui";
import { DeliveryForm } from "../delivery/DeliveryForm";
import { PaymentScreen } from "../payment/PaymentScreen";
import { PrintStatus } from "../printing/PrintStatus";
import { useSession } from "../../app/session";
import { MenuGrid } from "./MenuGrid";
import { PromoField } from "./PromoField";
import { DraftLines, Totals } from "./Ticket";
import { useDraft } from "./useDraft";

interface Props {
  menu: MenuGroup[];
  /** Remembered by the shell, so switching pages does not lose the order. Read once. */
  draftId: string | null;
  onDraft: (id: string | null) => void;
  onDineIn: () => void;
  onSent: () => void;
}

export function OrderScreen(props: Props) {
  const { draftId } = props;
  const [initial, setInitial] = useState<Order | null | undefined>(draftId ? undefined : null);
  useEffect(() => {
    if (initial !== undefined || !draftId) return;
    // A remembered order that was finished elsewhere is gone: start clean.
    api
      .get<Order>(`/orders/${draftId}`)
      .then((order) => setInitial(order.state === "draft" ? order : null))
      .catch(() => setInitial(null));
  }, [initial, draftId]);
  if (initial === undefined) return <div className="order" />;
  return <Editor {...props} initial={initial} />;
}

interface DraftSummary {
  id: string;
  type: OrderType;
  total: number;
  created_at: string;
  first_item: string;
  items: number;
}

function Editor({ menu, initial, onDraft, onDineIn, onSent }: Props & { initial: Order | null }) {
  const { t } = useI18n();
  const { settings } = useSession();
  const draft = useDraft(initial);
  const [paying, setPaying] = useState(false);
  const [details, setDetails] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sent, setSent] = useState<Order | null>(null);
  const { busy, error, run } = useAction();
  const drafts = useLoad(() => api.get<DraftSummary[]>("/orders/drafts"), draft.order?.id ?? "");
  const others = drafts.data?.filter((d) => d.id !== draft.order?.id) ?? [];
  const { order } = draft;

  const id = order?.id ?? null;
  useEffect(() => onDraft(id), [id, onDraft]);

  const startNew = () => {
    draft.reset(null);
    setPaying(false);
    setDetails(false);
    setSent(null);
    onSent();
    void drafts.reload();
  };

  if (paying && order) {
    return (
      <PaymentScreen
        order={order}
        onBack={async () => {
          draft.accept(await api.get<Order>(`/orders/${order.id}`).catch(() => order));
          draft.refresh();
          setPaying(false);
        }}
        onDone={startNew}
      />
    );
  }

  const delivery = draft.type === "delivery";
  const empty = draft.lines.length === 0;
  const complete =
    !delivery ||
    [
      draft.delivery.customer,
      draft.delivery.phone,
      draft.delivery.address,
      draft.delivery.driver,
    ].every((v) => v.trim());
  const ready = order !== null && draft.settled && !empty && !busy;
  const quantities: Record<string, number> = {};
  for (const l of draft.lines) quantities[l.product_id] = (quantities[l.product_id] ?? 0) + l.qty;

  return (
    <div className="order">
      <div className="work">
        {delivery && details ? (
          <DeliveryForm draft={draft} onBack={() => setDetails(false)} />
        ) : (
          <MenuGrid menu={menu} quantities={quantities} onPick={draft.add} />
        )}
      </div>
      <aside className="ticket">
        <div className="ticket-head grid gap-2">
          <Segmented<OrderType>
            options={[
              ["takeaway", t("type.takeaway")],
              ["dine_in", t("type.dine_in")],
              ["delivery", t("type.delivery")],
            ]}
            value={draft.type}
            onChange={(type) => {
              if (type === "dine_in") return onDineIn();
              if (type !== draft.type) draft.setType(type);
              setDetails(type === "delivery");
            }}
          />
          {delivery && (
            <Button
              size="s"
              variant={complete ? "plain" : "dark"}
              onClick={() => setDetails(!details)}
            >
              {t(details ? "delivery.to_products" : "delivery.details")}
            </Button>
          )}
          {empty && others.length > 0 && (
            <Button size="s" onClick={() => setChoosing(true)}>
              {t("draft.unfinished", { count: others.length })}
            </Button>
          )}
        </div>
        <div className="scroll flex-1">
          <DraftLines draft={draft} />
          {empty && <p className="soft p-6 text-center">{t("order.empty")}</p>}
        </div>
        <div className="ticket-foot">
          <PromoField
            order={empty ? null : order}
            disabled={!draft.settled}
            onChange={(next) => draft.accept(next)}
          />
          <Totals order={empty ? null : order} pending={!draft.settled} />
          <ErrorNote error={draft.error ?? error} />
          {draft.error !== null && (
            <Button size="s" onClick={() => void draft.flush()}>
              {t("retry")}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              size={delivery ? "m" : "l"}
              disabled={!order || busy || draft.saving}
              onClick={() =>
                run(async () => {
                  const latest = await api.get<Order>(`/orders/${order!.id}`);
                  await api.post(`/orders/${latest.id}/cancel`, { version: latest.version });
                  startNew();
                })
              }
            >
              {t("cancel")}
            </Button>
            {delivery && (
              <Button
                disabled={!ready || !complete}
                className="flex-1"
                onClick={() =>
                  run(async () => {
                    const body = { version: order!.version, expected_total: order!.total };
                    setSent(await api.post<Order>(`/orders/${order!.id}/confirm`, body));
                  })
                }
              >
                {t("delivery.send")}
              </Button>
            )}
            {!delivery && (
              <Button
                variant="primary"
                size="l"
                className="flex-1"
                disabled={!ready}
                onClick={() => setPaying(true)}
              >
                {t("pay")}
              </Button>
            )}
          </div>
          {delivery && (
            <Button
              variant="primary"
              size="l"
              disabled={!ready || !complete}
              onClick={() => setPaying(true)}
            >
              {t("pay.now")}
            </Button>
          )}
          {delivery && !complete && !empty && (
            <p className="soft text-sm">{t("delivery.missing")}</p>
          )}
        </div>
      </aside>
      {choosing && (
        <Dialog title={t("draft.title")} wide onClose={() => setChoosing(false)}>
          <Table head={[t("time"), t("type"), t("items"), t("total"), ""]}>
            {others.map((d) => (
              <tr key={d.id}>
                <td>
                  <Ltr>{formatTime(d.created_at)}</Ltr>
                </td>
                <td>{t(`type.${d.type}`)}</td>
                <td>
                  <bdi>{d.first_item}</bdi> ({d.items})
                </td>
                <td>
                  <Lbp value={d.total} />
                </td>
                <td>
                  <Button
                    size="s"
                    variant="dark"
                    onClick={() =>
                      run(async () => {
                        draft.reset(await api.get<Order>(`/orders/${d.id}`));
                        setChoosing(false);
                      })
                    }
                  >
                    {t("draft.resume")}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          <Button onClick={() => setChoosing(false)}>{t("back")}</Button>
        </Dialog>
      )}
      {sent && (
        <Dialog title={t("delivery.sent")}>
          <p className="soft">{t("order.number", { number: sent.number })}</p>
          {sent.print_job && (
            <PrintStatus job={sent.print_job} auto={settings.printer.auto_print} />
          )}
          <Button variant="primary" size="l" onClick={startNew}>
            {t("order.new")}
          </Button>
        </Dialog>
      )}
    </div>
  );
}
