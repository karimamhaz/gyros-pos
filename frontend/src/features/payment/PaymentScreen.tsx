import { useEffect, useRef, useState } from "react";
import { useSession } from "../../app/session";
import { useI18n } from "../../i18n";
import { api, ApiError } from "../../shared/api";
import { NumberPad, typeInto } from "../../shared/keyboard";
import type { Order, Quote } from "../../shared/types";
import { AmountField, Button, ErrorNote, Lbp, Line, Segmented, Tag, Usd } from "../../shared/ui";
import { SavedLines, Totals } from "../order/Ticket";
import { PrintStatus } from "../printing/PrintStatus";

type ChangeMode = "lbp" | "usd" | "mixed";
interface Body {
  idempotency_key: string;
  version: number;
  expected_due: number;
  usd_cents: number;
  lbp: number;
  change_usd_cents: number;
  change_lbp: number;
}
interface Done {
  order: Order;
  change_usd_cents: number;
  change_lbp: number;
}

interface Props {
  order: Order;
  onBack: () => void;
  onDone: (order: Order) => void;
}

export function PaymentScreen({ order, onBack, onDone }: Props) {
  const { t } = useI18n();
  const [usd, setUsd] = useState(0);
  const [lbp, setLbp] = useState(0);
  const [mode, setMode] = useState<ChangeMode>("lbp");
  const [mixedUsd, setMixedUsd] = useState(0);
  const [answer, setAnswer] = useState<{ asked: string; quote: Quote } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState<Body | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const turn = useRef(0);
  const asked = [usd, lbp, mode, mixedUsd].join(":");
  const quote = answer?.quote ?? null;
  const fields = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLInputElement | null>(null);

  // The server works out the balance and the change; old answers are ignored.
  useEffect(() => {
    const mine = ++turn.current;
    const ask = async () => {
      const body = { usd_cents: usd, lbp };
      const path = `/orders/${order.id}/quote`;
      try {
        let q = await api.post<Quote>(path, body);
        const wanted = mode === "usd" ? q.most_usd_cents : mode === "mixed" ? mixedUsd : 0;
        if (wanted) q = await api.post<Quote>(path, { ...body, change_usd_cents: wanted });
        if (mine === turn.current) {
          setAnswer({ asked, quote: q });
          setError(null);
        }
      } catch (e) {
        if (mine === turn.current) setError(e);
      }
    };
    void ask();
  }, [order.id, usd, lbp, mode, mixedUsd, asked]);

  const firstField = () => fields.current?.querySelector("input") ?? null;

  const send = async (body: Body) => {
    setBusy(true);
    setError(null);
    for (let attempt = 1; ; attempt++) {
      try {
        const paid = await api.post<Order>(`/orders/${order.id}/payments`, body);
        setUncertain(null);
        setDone({ order: paid, ...body });
        break;
      } catch (e) {
        // Without an answer it may already be saved, so only the same request is repeated.
        const unknown =
          e instanceof ApiError && (e.status === 0 || e.status === 503 || e.status === 500);
        if (unknown && attempt < 4) {
          await new Promise((r) => setTimeout(r, 700 * attempt));
          continue;
        }
        setError(e);
        setUncertain(unknown ? body : null);
        if (!unknown) setKey(crypto.randomUUID());
        break;
      }
    }
    setBusy(false);
  };

  const fresh =
    quote !== null &&
    answer?.asked === asked &&
    (mode !== "mixed" || quote.change_usd_cents === mixedUsd || quote.overpaid === 0);
  const partial = quote !== null && !quote.settled && quote.partial_allowed;
  const ready = fresh && quote !== null && (quote.settled || partial) && !error;

  if (done) return <Paid done={done} onDone={() => onDone(done.order)} />;
  return (
    <div className="order">
      <div className="work" style={{ padding: "18px 28px" }}>
        <div className="line">
          <h1>{t("pay")}</h1>
          <Button disabled={busy || uncertain !== null} onClick={onBack}>
            {t("pay.back")}
          </Button>
        </div>
        <fieldset disabled={busy || uncertain !== null} className="grid gap-4">
          <div
            className="grid grid-cols-2 gap-4 big-input"
            ref={fields}
            onFocus={(e) => {
              active.current = e.target as unknown as HTMLInputElement;
            }}
          >
            <AmountField
              label={t("pay.got_usd")}
              currency="USD"
              kind="none"
              value={usd}
              onChange={setUsd}
              autoFocus
            />
            <AmountField
              label={t("pay.got_lbp")}
              currency="LBP"
              kind="none"
              value={lbp}
              onChange={setLbp}
            />
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: "330px 1fr" }}>
            <NumberPad
              decimal={false}
              extra="."
              onKey={(k) => {
                const field = active.current ?? firstField();
                if (!field) return;
                if (document.activeElement !== field) field.focus();
                typeInto(field, k);
              }}
            />
            <div className="box p-5 grid gap-3 content-start">
              {quote && quote.overpaid > 0 ? (
                <>
                  <div className="line">
                    <h2>{t("pay.change")}</h2>
                    <b className="text-[23px]">
                      <Lbp value={quote.overpaid} />
                    </b>
                  </div>
                  <Segmented<ChangeMode>
                    options={[
                      ["lbp", t("pay.change.lbp")],
                      ["usd", t("pay.change.usd")],
                      ["mixed", t("pay.change.mixed")],
                    ]}
                    value={mode}
                    onChange={(m) => {
                      setMode(m);
                      if (m === "mixed") setMixedUsd(quote.change_usd_cents);
                    }}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    {mode === "mixed" ? (
                      <AmountField
                        label={t("pay.give_usd")}
                        currency="USD"
                        kind="none"
                        value={mixedUsd}
                        onChange={setMixedUsd}
                        onFocus={() => {
                          active.current = document.activeElement as HTMLInputElement;
                        }}
                      />
                    ) : (
                      <div>
                        <div className="label">{t("pay.give_usd")}</div>
                        <div className="text-[22px] font-bold">
                          <Usd cents={quote.change_usd_cents} />
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="label">{t("pay.give_lbp")}</div>
                      <div className="text-[22px] font-bold">
                        <Lbp value={quote.change_lbp} />
                      </div>
                    </div>
                  </div>
                  {mode === "mixed" && mixedUsd !== quote.change_usd_cents && (
                    <div className="error-note">{t("error.change_too_much")}</div>
                  )}
                  {quote.change_rounding !== 0 && (
                    <p className="soft">
                      {t(quote.change_rounding < 0 ? "pay.rounding.up" : "pay.rounding.down")}{" "}
                      <Lbp value={Math.abs(quote.change_rounding)} />
                    </p>
                  )}
                </>
              ) : quote && quote.settled ? (
                <>
                  <h2>{t(quote.shortfall ? "pay.small_balance" : "pay.exact")}</h2>
                  {quote.shortfall > 0 && (
                    <p>
                      {t("pay.small_balance.hint")} <Lbp value={quote.shortfall} />
                    </p>
                  )}
                </>
              ) : quote ? (
                <>
                  <div className="line">
                    <h2>{t("left")}</h2>
                    <b className="text-[23px] text-brand">
                      <Lbp value={quote.left} />
                    </b>
                  </div>
                  <div className="line soft">
                    <span>{t("in_usd")}</span>
                    <Usd cents={quote.left_usd_cents} />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="s" onClick={() => setLbp(lbp + quote.left)}>
                      {t("pay.rest_lbp")}
                    </Button>
                    <Button size="s" onClick={() => setUsd(usd + quote.left_usd_cents)}>
                      {t("pay.rest_usd")}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </fieldset>
        {quote && (
          <div className="soft">
            {t("rate")}: <Lbp value={quote.rate} />
          </div>
        )}
        {uncertain && <div className="error-note">{t("pay.uncertain")}</div>}
        {!uncertain && <ErrorNote error={error} />}
      </div>
      <aside className="ticket">
        <div className="ticket-head line">
          <h2>{t(`type.${order.type}`)}</h2>
          <Tag tone="bad">{t(`state.${order.payment_state}`)}</Tag>
        </div>
        <div className="scroll flex-1">
          <SavedLines
            items={order.items.map((i) => ({
              ...i,
              state: i.state === "draft" ? "confirmed" : i.state,
            }))}
          />
        </div>
        <div className="ticket-foot">
          <Totals order={order} />
          {quote && (
            <Line label={t("pay.received")}>
              <Lbp value={quote.received} />
            </Line>
          )}
          <Button
            variant="primary"
            size="l"
            disabled={busy || (!uncertain && !ready)}
            onClick={() =>
              void send(
                uncertain ?? {
                  idempotency_key: key,
                  version: order.version,
                  expected_due: order.due,
                  usd_cents: usd,
                  lbp,
                  change_usd_cents: quote!.change_usd_cents,
                  change_lbp: quote!.change_lbp,
                },
              )
            }
          >
            {t(uncertain ? "pay.check" : partial ? "pay.partial" : "pay.confirm")}
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Paid({ done, onDone }: { done: Done; onDone: () => void }) {
  const { t } = useI18n();
  const { settings } = useSession();
  const { order } = done;
  const paid = order.state === "completed";
  return (
    <div className="order items-center justify-center">
      <div className="dialog box" role="status">
        <div className="line">
          <h1>{t(paid ? "paid.title" : "paid.partial")}</h1>
          <Tag tone={paid ? "good" : "warn"}>{t(`state.${order.payment_state}`)}</Tag>
        </div>
        <p className="soft">{t("order.number", { number: order.number })}</p>
        {(done.change_usd_cents > 0 || done.change_lbp > 0) && (
          <div className="box p-4 text-center">
            <div className="soft">{t("paid.give")}</div>
            <div className="text-[30px] font-bold flex justify-center gap-3" dir="ltr">
              {done.change_usd_cents > 0 && <Usd cents={done.change_usd_cents} />}
              {done.change_usd_cents > 0 && done.change_lbp > 0 && <span>+</span>}
              {done.change_lbp > 0 && <Lbp value={done.change_lbp} />}
            </div>
          </div>
        )}
        {!paid && (
          <Line label={t("left")}>
            <b className="text-brand">
              <Lbp value={order.due} />
            </b>
          </Line>
        )}
        {order.print_job && (
          <PrintStatus job={order.print_job} auto={settings.printer.auto_print} />
        )}
        <Button variant="primary" size="l" onClick={onDone}>
          {t(order.type === "dine_in" ? "paid.back_to_table" : "order.new")}
        </Button>
      </div>
    </div>
  );
}
