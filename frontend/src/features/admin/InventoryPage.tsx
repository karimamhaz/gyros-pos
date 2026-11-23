import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { formatDateTime, formatNumber, parseInteger } from "../../shared/format";
import {
  Button,
  ChoiceField,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  Ltr,
  Table,
  Tag,
  useAction,
  useLoad,
} from "../../shared/ui";
import { Head } from "./Head";
import type { FullMenu } from "./ProductsPage";

interface Item {
  id: string;
  name: string;
  product_id: string | null;
  quantity: number;
  threshold: number;
  updated_at: string;
  status: "ok" | "low" | "out";
}
interface Movement {
  id: string;
  kind: MoveKind;
  change: number;
  quantity_after: number;
  reason: string;
  at: string;
}
type MoveKind = "in" | "out" | "count";
type Asking = { edit: Item | null } | { move: Item; kind: MoveKind } | { history: Item } | null;
const TONE = { ok: "good", low: "warn", out: "bad" } as const;

export function InventoryPage() {
  const { t } = useI18n();
  const items = useLoad(() => api.get<Item[]>("/inventory"));
  const [asking, setAsking] = useState<Asking>(null);
  const done = () => {
    setAsking(null);
    void items.reload();
  };
  return (
    <>
      <Head title={t("admin.inventory")}>
        <Button size="s" variant="primary" onClick={() => setAsking({ edit: null })}>
          {t("stock.new")}
        </Button>
      </Head>
      <ErrorNote error={items.error} />
      {items.data?.length === 0 && <Empty>{t("stock.none")}</Empty>}
      {!!items.data?.length && (
        <Table
          head={[
            t("stock.item"),
            t("stock.quantity"),
            t("stock.threshold"),
            t("stock.updated"),
            t("status"),
            "",
          ]}
        >
          {items.data.map((i) => (
            <tr key={i.id}>
              <td>
                <b>
                  <bdi>{i.name}</bdi>
                </b>
              </td>
              <td>
                <Ltr>{formatNumber(i.quantity)}</Ltr>
              </td>
              <td>
                <Ltr>{formatNumber(i.threshold)}</Ltr>
              </td>
              <td>
                <Ltr>{formatDateTime(i.updated_at)}</Ltr>
              </td>
              <td>
                <Tag tone={TONE[i.status]}>{t(`stock.${i.status}`)}</Tag>
              </td>
              <td>
                <div className="flex gap-2 justify-end">
                  {(["in", "out", "count"] as const).map((kind) => (
                    <Button size="s" key={kind} onClick={() => setAsking({ move: i, kind })}>
                      {t(`stock.${kind === "out" ? "take" : kind}`)}
                    </Button>
                  ))}
                  <Button size="s" onClick={() => setAsking({ history: i })}>
                    {t("stock.history")}
                  </Button>
                  <Button size="s" onClick={() => setAsking({ edit: i })}>
                    {t("edit")}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="soft">{t("stock.rules")}</p>
      {asking && "edit" in asking && (
        <EditDialog item={asking.edit} onClose={() => setAsking(null)} onDone={done} />
      )}
      {asking && "move" in asking && (
        <MoveDialog
          item={asking.move}
          kind={asking.kind}
          onClose={() => setAsking(null)}
          onDone={done}
        />
      )}
      {asking && "history" in asking && (
        <HistoryDialog item={asking.history} onClose={() => setAsking(null)} />
      )}
    </>
  );
}

function EditDialog({
  item,
  onClose,
  onDone,
}: {
  item: Item | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const menu = useLoad(() => api.get<FullMenu>("/menu/all"));
  const [name, setName] = useState(item?.name ?? "");
  const [product, setProduct] = useState(item?.product_id ?? "");
  const [threshold, setThreshold] = useState(String(item?.threshold ?? ""));
  const { busy, error, run } = useAction();
  return (
    <Dialog title={t(item ? "stock.edit" : "stock.new")} onClose={onClose}>
      <Field label={t("name")} value={name} onChange={setName} maxLength={60} />
      <ChoiceField
        label={t("stock.product")}
        value={product}
        options={[
          ["", t("stock.no_product")],
          ...(menu.data?.products.map((p) => [p.id, p.name] as [string, string]) ?? []),
        ]}
        onChange={setProduct}
      />
      <Field
        label={t("stock.threshold")}
        kind="digits"
        value={threshold}
        onChange={setThreshold}
        maxLength={7}
      />
      <ErrorNote error={error ?? menu.error} />
      <div className="flex gap-3">
        <Button onClick={onClose}>{t("back")}</Button>
        {item && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.delete(`/inventory/${item.id}`);
                onDone();
              })
            }
          >
            {t("remove")}
          </Button>
        )}
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || !name.trim()}
          onClick={() =>
            run(async () => {
              const body = {
                name,
                product_id: product || null,
                threshold: parseInteger(threshold),
              };
              if (item) await api.put(`/inventory/${item.id}`, body);
              else await api.post("/inventory", body);
              onDone();
            })
          }
        >
          {t("save")}
        </Button>
      </div>
    </Dialog>
  );
}

function MoveDialog({
  item,
  kind,
  onClose,
  onDone,
}: {
  item: Item;
  kind: MoveKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction();
  return (
    <Dialog
      title={
        <>
          {t(`stock.${kind === "out" ? "take" : kind}`)}: <bdi>{item.name}</bdi>
        </>
      }
      onClose={onClose}
    >
      <p className="soft">
        {t("stock.now")} <Ltr>{formatNumber(item.quantity)}</Ltr>
      </p>
      <Field
        label={t(kind === "count" ? "stock.counted" : "stock.quantity")}
        kind="digits"
        autoFocus
        value={quantity}
        onChange={setQuantity}
        maxLength={7}
      />
      <Field label={t("stock.reason")} value={reason} onChange={setReason} maxLength={120} />
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button onClick={onClose}>{t("back")}</Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || quantity === "" || (kind !== "count" && !parseInteger(quantity))}
          onClick={() =>
            run(async () => {
              const body = { kind, quantity: parseInteger(quantity), reason };
              await api.post(`/inventory/${item.id}/movements`, body);
              onDone();
            })
          }
        >
          {t("save")}
        </Button>
      </div>
    </Dialog>
  );
}

function HistoryDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useI18n();
  const moves = useLoad(() => api.get<Movement[]>(`/inventory/${item.id}/movements`));
  return (
    <Dialog title={<bdi>{item.name}</bdi>} wide onClose={onClose}>
      <ErrorNote error={moves.error} />
      {moves.data?.length === 0 && <Empty>{t("stock.no_history")}</Empty>}
      {!!moves.data?.length && (
        <Table
          head={[t("time"), t("type"), t("stock.change"), t("stock.after"), t("stock.reason")]}
        >
          {moves.data.map((m) => (
            <tr key={m.id}>
              <td>
                <Ltr>{formatDateTime(m.at)}</Ltr>
              </td>
              <td>{t(`stock.${m.kind === "out" ? "take" : m.kind}`)}</td>
              <td>
                <Ltr>{(m.change > 0 ? "+" : "") + formatNumber(m.change)}</Ltr>
              </td>
              <td>
                <Ltr>{formatNumber(m.quantity_after)}</Ltr>
              </td>
              <td>
                <bdi>{m.reason}</bdi>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Button onClick={onClose}>{t("back")}</Button>
    </Dialog>
  );
}
