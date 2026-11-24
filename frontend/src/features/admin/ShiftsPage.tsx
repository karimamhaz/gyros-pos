import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { formatDateTime, formatNumber, formatUsd } from "../../shared/format";
import type { ShiftState } from "../../shared/types";
import {
  Button,
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
import { CountFields, emptyCount } from "../shift/CountFields";
import { Head } from "./Head";

interface Row {
  id: string;
  cashier: string;
  opened_at: string;
  closed_at: string | null;
  reference: string | null;
  difference_usd_cents: number | null;
  difference_lbp: number | null;
}
interface Money {
  usd_cents: number;
  lbp: number;
}
interface Review extends Row {
  opening: Money;
  cash_in: Money;
  cash_out: Money;
  expected: Money;
  /** Paid by Wish during the shift: not cash, so it is not in the figures above. */
  wish: number;
  declared: Money | null;
  closed_by: string | null;
  closed_by_admin: boolean;
}

interface Props {
  current: ShiftState;
  reloadCurrent: () => Promise<void>;
}

export function ShiftsPage({ current, reloadCurrent }: Props) {
  const { t } = useI18n();
  const [reference, setReference] = useState("");
  const [searched, setSearched] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const query = searched ? `?reference=${encodeURIComponent(searched)}` : "";
  const shifts = useLoad(() => api.get<Row[]>(`/shifts${query}`), query);
  const review = useLoad(
    async () => (picked ? api.get<Review>(`/shifts/${picked}`) : null),
    picked ?? "",
  );

  const status = (r: Row) => {
    if (!r.closed_at) return <Tag tone="warn">{t("shifts.open")}</Tag>;
    return r.difference_lbp || r.difference_usd_cents ? (
      <Tag tone="bad">{t("shifts.difference")}</Tag>
    ) : (
      <Tag tone="good">{t("shifts.match")}</Tag>
    );
  };

  return (
    <>
      <Head title={t("admin.shifts")}>
        {current.open && !current.mine && (
          <Button variant="danger" onClick={() => setClosing(true)}>
            {t("shifts.close_for", { name: current.cashier })}
          </Button>
        )}
        <div className="w-[220px] bare">
          <Field
            label={t("shift.reference")}
            placeholder={t("shift.reference")}
            kind="latin"
            value={reference}
            onChange={(text) => setReference(text.toUpperCase())}
            onEnter={() => setSearched(reference.trim())}
            maxLength={20}
          />
        </div>
        <Button onClick={() => setSearched(reference.trim())}>{t("find.search")}</Button>
        {searched && (
          <Button
            onClick={() => {
              setReference("");
              setSearched("");
            }}
          >
            {t("show_all")}
          </Button>
        )}
      </Head>
      <ErrorNote error={shifts.error ?? review.error} />
      {shifts.data?.length === 0 && <Empty>{t("shifts.none")}</Empty>}
      <div className="split scroll">
        {!!shifts.data?.length && (
          <div className="main-panel grid">
            <Table head={[t("role.cashier"), t("shifts.closed"), t("status"), ""]}>
              {shifts.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>
                      <bdi>{r.cashier}</bdi>
                    </b>
                  </td>
                  <td>
                    <Ltr>{r.closed_at ? formatDateTime(r.closed_at) : "—"}</Ltr>
                  </td>
                  <td>{status(r)}</td>
                  <td>
                    <Button
                      size="s"
                      variant={r.id === picked ? "dark" : "plain"}
                      onClick={() => setPicked(r.id)}
                    >
                      {t("view")}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
        {review.data && (
          <div className="box p-5 main-panel">
            <ReviewCard r={review.data} />
          </div>
        )}
      </div>
      {closing && (
        <CloseAbandoned
          current={current}
          onClose={() => setClosing(false)}
          onDone={() => {
            setClosing(false);
            void reloadCurrent();
            void shifts.reload();
          }}
        />
      )}
    </>
  );
}

function ReviewCard({ r }: { r: Review }) {
  const { t } = useI18n();
  const rows: [string, Money | null, boolean?][] = [
    [t("shifts.opening"), r.opening],
    [t("shifts.in"), r.cash_in],
    [t("shifts.out"), { usd_cents: -r.cash_out.usd_cents, lbp: -r.cash_out.lbp }],
    [t("shifts.expected"), r.expected, true],
    [t("shifts.declared"), r.declared, true],
  ];
  const bad = "text-brand font-bold";
  return (
    <>
      <div className="line">
        <h2>{t("shifts.of", { name: r.cashier })}</h2>
        {r.reference && (
          <b>
            <Ltr>{r.reference}</Ltr>
          </b>
        )}
      </div>
      <p className="soft mb-3">
        <Ltr>
          {formatDateTime(r.opened_at)} – {r.closed_at ? formatDateTime(r.closed_at) : "…"}
        </Ltr>
      </p>
      {r.closed_by_admin && (
        <p className="mb-3">
          <Tag tone="warn">{t("shifts.by_admin", { name: r.closed_by })}</Tag>
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th />
            <th>USD</th>
            <th>{t("lbp")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, money, strong]) => (
            <tr key={label} className={strong ? "font-bold" : ""}>
              <td>{label}</td>
              <td>
                <Ltr>{money ? formatUsd(money.usd_cents) : "—"}</Ltr>
              </td>
              <td>
                <Ltr>{money ? formatNumber(money.lbp) : "—"}</Ltr>
              </td>
            </tr>
          ))}
          {r.declared && (
            <tr className="font-bold">
              <td>{t("shifts.difference")}</td>
              <td className={r.difference_usd_cents ? bad : ""}>
                <Ltr>{formatUsd(r.difference_usd_cents ?? 0)}</Ltr>
              </td>
              <td className={r.difference_lbp ? bad : ""}>
                <Ltr>{formatNumber(r.difference_lbp ?? 0)}</Ltr>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="line mt-3">
        <span>{t("sales.wish")}</span>
        <b>
          <Ltr>{formatNumber(r.wish)}</Ltr>
        </b>
      </div>
      <p className="soft mt-3">{t("shifts.no_expenses")}</p>
    </>
  );
}

function CloseAbandoned({
  current,
  onClose,
  onDone,
}: {
  current: ShiftState;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [count, setCount] = useState(() => emptyCount(current.count_mode));
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();
  return (
    <Dialog title={t("shifts.close_for", { name: current.cashier })} onClose={onClose}>
      <p className="soft">{t("shift.open.hint")}</p>
      <CountFields value={count} onChange={setCount} />
      <Field label={t("approval.reason")} value={reason} onChange={setReason} maxLength={200} />
      <Field
        label={t("password.own")}
        kind="latin"
        password
        value={password}
        onChange={setPassword}
      />
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button size="l" onClick={onClose}>
          {t("back")}
        </Button>
        <Button
          variant="primary"
          size="l"
          className="flex-1"
          disabled={busy || reason.trim().length < 2 || !password}
          onClick={() =>
            run(async () => {
              await api.post("/shifts/close-abandoned", { count, reason, password });
              onDone();
            })
          }
        >
          {t("shifts.close")}
        </Button>
      </div>
    </Dialog>
  );
}
