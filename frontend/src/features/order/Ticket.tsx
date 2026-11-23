import { useState, type ReactNode } from "react";
import { useI18n } from "../../i18n";
import { formatNumber } from "../../shared/format";
import type { Order, OrderItem } from "../../shared/types";
import { Button, Dialog, Field, Lbp, Line as Row, Ltr, Usd } from "../../shared/ui";
import type { Draft, Line } from "./useDraft";

export function DraftLines({ draft }: { draft: Draft }) {
  const { t } = useI18n();
  const [noting, setNoting] = useState<Line | null>(null);
  return (
    <>
      {draft.lines.map((line) => (
        <div className="item" key={line.key}>
          <div className="qty">
            <button
              type="button"
              aria-label="+"
              onClick={() => draft.setQty(line.key, line.qty + 1)}
            >
              +
            </button>
            <span>{line.qty}</span>
            <button
              type="button"
              aria-label="-"
              onClick={() => draft.setQty(line.key, line.qty - 1)}
            >
              −
            </button>
          </div>
          <button type="button" className="item-name" onClick={() => setNoting(line)}>
            <b>
              <bdi>{line.name}</bdi>
            </b>
            {line.note ? (
              <span className="note">
                <bdi>{line.note}</bdi>
              </span>
            ) : (
              <span className="soft text-[13px]">+ {t("note")}</span>
            )}
          </button>
          <b>
            <Ltr>{formatNumber(line.price * line.qty)}</Ltr>
          </b>
        </div>
      ))}
      {noting && (
        <NoteDialog
          line={noting}
          onClose={() => setNoting(null)}
          onSave={(note) => {
            draft.setNote(noting.key, note);
            setNoting(null);
          }}
        />
      )}
    </>
  );
}

function NoteDialog({
  line,
  onSave,
  onClose,
}: {
  line: Line;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState(line.note);
  return (
    <Dialog title={<bdi>{line.name}</bdi>} onClose={onClose}>
      <Field
        label={t("note")}
        value={note}
        onChange={setNote}
        maxLength={120}
        autoFocus
        onEnter={() => onSave(note.trim())}
      />
      <div className="flex gap-3">
        <Button onClick={onClose}>{t("back")}</Button>
        <Button variant="dark" className="flex-1" onClick={() => onSave(note.trim())}>
          {t("save")}
        </Button>
      </div>
    </Dialog>
  );
}

export function SavedLines({
  items,
  onVoid,
}: {
  items: OrderItem[];
  onVoid?: (item: OrderItem) => void;
}) {
  const { t } = useI18n();
  return items
    .filter((i) => i.state === "confirmed")
    .map((i) => (
      <div className="item" key={i.id}>
        <b className="w-9">
          <Ltr>{i.qty}×</Ltr>
        </b>
        <div className="flex-1">
          <b>
            <bdi>{i.name}</bdi>
          </b>
          {i.note && (
            <div className="note">
              <bdi>{i.note}</bdi>
            </div>
          )}
        </div>
        <b>
          <Ltr>{formatNumber(i.line_total)}</Ltr>
        </b>
        {onVoid && (
          <Button size="s" variant="danger" onClick={() => onVoid(i)}>
            {t("remove")}
          </Button>
        )}
      </div>
    ));
}

/** Server figures only; `pending` dims them while a change is being saved. */
export function Totals({
  order,
  pending,
  children,
}: {
  order: Order | null;
  pending?: boolean;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const o = order;
  const detailed = o && (o.delivery_fee > 0 || o.promo || o.type === "delivery");
  return (
    <div className={pending ? "opacity-40" : ""}>
      {detailed && (
        <>
          <Row label={t("items")}>
            <Lbp value={o.items_total} />
          </Row>
          {o.type === "delivery" && (
            <Row label={t("delivery.fee")}>
              <Lbp value={o.delivery_fee} />
            </Row>
          )}
          {o.promo && (
            <Row
              label={
                <>
                  {t("discount")} <Ltr>{`${o.promo.code} (${o.promo.percent}%)`}</Ltr>
                </>
              }
            >
              <Lbp value={-o.discount} />
            </Row>
          )}
          {o.rounding !== 0 && (
            <Row label={t("rounding")} className="soft">
              <Lbp value={o.rounding} />
            </Row>
          )}
        </>
      )}
      <div className="line">
        <h2>{t("total")}</h2>
        <div className="text-end">
          <div className="total">
            <Lbp value={o?.total ?? 0} />
          </div>
          <div className="soft">
            <Usd cents={o?.total_usd_cents ?? 0} />
          </div>
        </div>
      </div>
      {o && o.paid > 0 && o.due > 0 && (
        <Row label={t("left")}>
          <b className="text-brand">
            <Lbp value={o.due} />
          </b>
        </Row>
      )}
      {children}
    </div>
  );
}
