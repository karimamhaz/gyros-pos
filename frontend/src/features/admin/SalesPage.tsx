import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { bridge, saveFile } from "../../shared/bridge";
import { formatDate, formatNumber, formatUsd } from "../../shared/format";
import type { OrderType } from "../../shared/types";
import {
  Button,
  ErrorNote,
  Lbp,
  Line,
  Ltr,
  Segmented,
  Usd,
  useAction,
  useLoad,
} from "../../shared/ui";
import { DateField } from "./DateField";
import { Head } from "./Head";
import { salesHtml } from "./salesHtml";

export interface Sales {
  start: string;
  end: string;
  sales: number;
  delivery_fees: number;
  orders: number;
  refunds: number;
  outstanding: number;
  trend: { unit: "day" | "month"; points: { at: string; sales: number }[] };
  by_type: Record<OrderType, number>;
  by_cashier: { name: string; sales: number }[];
  cash: { usd_cents: number; lbp: number };
  products: { id: string; name: string; qty: number }[];
  profit: { profit: number; logged: number } | null;
}

type Period = "day" | "week" | "month" | "overall" | "custom";

export function SalesPage() {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState<Period>("day");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState("");
  const [product, setProduct] = useState("");
  const [user, setUser] = useState("");
  const query = new URLSearchParams({ period });
  if (period === "custom") {
    if (start) query.set("start", start);
    if (end) query.set("end", end);
  }
  if (type) query.set("type", type);
  if (product) query.set("product_id", product);
  if (user) query.set("user_id", user);
  const key = query.toString();
  const sales = useLoad(() => api.get<Sales>(`/reports/sales?${key}`), key);
  const menu = useLoad(() => api.get<{ products: { id: string; name: string }[] }>("/menu/all"));
  const cashiers = useLoad(() => api.get<{ id: string; display_name: string }[]>("/cashiers"));
  const { busy, error, run } = useAction();
  const r = sales.data;

  const pick = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: [string, string][],
  ) => (
    <select className="pick" aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{label}</option>
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <Head title={t("admin.sales")}>
        <Button
          size="s"
          disabled={busy || !r}
          onClick={() =>
            run(async () =>
              saveFile(await api.blob(`/reports/sales/export?${key}`), `sales-${r!.start}.xlsx`),
            )
          }
        >
          {t("export.excel")}
        </Button>
        <Button
          size="s"
          disabled={busy || !r || !bridge}
          onClick={() => run(async () => bridge!.print(salesHtml(r!, lang, t), {}))}
        >
          {t("print.now")}
        </Button>
      </Head>
      <div className="line flex-wrap">
        <Segmented<Period>
          options={[
            ["day", t("period.day")],
            ["week", t("period.week")],
            ["month", t("period.month")],
            ["overall", t("period.overall")],
            ["custom", t("period.custom")],
          ]}
          value={period}
          onChange={(next) => {
            if (next === "custom" && r) {
              setStart(r.start); // continue from what is shown
              setEnd(r.end);
            }
            setPeriod(next);
          }}
        />
        <div className="flex gap-2">
          {pick(t("filter.types"), type, setType, [
            ["takeaway", t("type.takeaway")],
            ["dine_in", t("type.dine_in")],
            ["delivery", t("type.delivery")],
          ])}
          {pick(
            t("filter.products"),
            product,
            setProduct,
            menu.data?.products.map((p) => [p.id, p.name]) ?? [],
          )}
          {pick(
            t("filter.cashiers"),
            user,
            setUser,
            cashiers.data?.map((c) => [c.id, c.display_name]) ?? [],
          )}
        </div>
      </div>
      {period === "custom" && (
        <div className="grid grid-cols-2 gap-3 w-[420px]">
          <DateField label={t("from")} value={start} onChange={setStart} />
          <DateField label={t("to")} value={end} onChange={setEnd} />
        </div>
      )}
      <ErrorNote error={error ?? sales.error} />
      {r && <Figures r={r} />}
    </>
  );
}

function Figures({ r }: { r: Sales }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const sold = r.products.filter((p) => p.qty > 0);
  const best = sold.slice(0, all ? 50 : 5);
  const least = [...r.products].reverse().slice(0, all ? 50 : 5);
  const bars = (rows: { name: string; value: number }[], show: (v: number) => React.ReactNode) => {
    const max = Math.max(...rows.map((x) => x.value), 1);
    return rows.map((x) => (
      <div className="bar-row" key={x.name} title={`${x.name}: ${formatNumber(x.value)}`}>
        <span>
          <bdi>{x.name}</bdi>
        </span>
        <div>
          <div className="bar" style={{ width: `${(Math.max(0, x.value) / max) * 100}%` }} />
        </div>
        <b>{show(x.value)}</b>
      </div>
    ));
  };
  const number = (v: number) => <Ltr>{formatNumber(v)}</Ltr>;

  return (
    <div className="grid gap-3.5 scroll">
      <div className="soft">
        <Ltr>
          {r.start === r.end
            ? formatDate(r.start)
            : `${formatDate(r.start)} – ${formatDate(r.end)}`}
        </Ltr>
      </div>
      <div className="kpis">
        <div className="box main">
          <span className="soft">{t("sales.total")}</span>
          <b>
            <Lbp value={r.sales} />
          </b>
          <span className="soft">
            {t("sales.fees")} <Lbp value={r.delivery_fees} />
          </span>
        </div>
        <div className="box">
          <span className="soft">{t("sales.orders")}</span>
          <b>{number(r.orders)}</b>
          {r.refunds > 0 && (
            <span className="soft">{t("sales.refunds", { count: r.refunds })}</span>
          )}
        </div>
        <div className="box">
          <span className="soft">{t("sales.outstanding")}</span>
          <b>
            <Lbp value={r.outstanding} />
          </b>
          <span className="soft">{t("sales.now")}</span>
        </div>
        {r.profit && (
          <div className="box">
            <span className="soft">{t("sales.profit")}</span>
            <b>
              <Lbp value={r.profit.profit} />
            </b>
            <span className="text-brand text-[12.5px]">{t("sales.profit_note")}</span>
          </div>
        )}
      </div>
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1.25fr 1fr" }}>
        <div className="box p-4">
          <h3>{t(r.trend.unit === "day" ? "sales.by_day" : "sales.by_month")}</h3>
          <Trend r={r} />
        </div>
        <div className="box p-4 grid gap-1 content-start">
          <h3>{t("sales.by_type")}</h3>
          {bars(
            (["takeaway", "dine_in", "delivery"] as const).map((k) => ({
              name: t(`type.${k}`),
              value: r.by_type[k],
            })),
            number,
          )}
          <div className="grid grid-cols-2 gap-6 mt-3">
            <div>
              <h3>{t("sales.cash")}</h3>
              <Line label="USD">
                <b>
                  <Usd cents={r.cash.usd_cents} />
                </b>
              </Line>
              <Line label={t("lbp")}>
                <b>{number(r.cash.lbp)}</b>
              </Line>
            </div>
            <div>
              <h3>{t("sales.by_cashier")}</h3>
              {r.by_cashier.map((c) => (
                <Line key={c.name} label={<bdi>{c.name}</bdi>}>
                  <b>{number(c.sales)}</b>
                </Line>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1.25fr 1fr" }}>
        <div className="box p-4">
          <h3>{t("sales.best")}</h3>
          {best.length === 0 && <p className="soft">{t("sales.nothing")}</p>}
          {bars(
            best.map((p) => ({ name: p.name, value: p.qty })),
            number,
          )}
        </div>
        <div className="box p-4">
          <h3>{t("sales.least")}</h3>
          {least.map((p) => (
            <Line key={p.id} label={<bdi>{p.name}</bdi>}>
              <b>{number(p.qty)}</b>
            </Line>
          ))}
        </div>
      </div>
      <Button size="s" onClick={() => setAll(!all)}>
        {t(all ? "sales.fewer" : "sales.all_products")}
      </Button>
    </div>
  );
}

/** One series, so the title names it and each bar carries its own value when there is room. */
function Trend({ r }: { r: Sales }) {
  const { lang } = useI18n();
  const { points, unit } = r.trend;
  const max = Math.max(...points.map((p) => p.sales), 1);
  const roomy = points.length <= 14;
  const every = Math.ceil(points.length / 14);
  const name = (at: string) => {
    const d = new Date(`${at}T12:00:00`);
    const locale = lang === "ar" ? "ar-LB-u-nu-latn" : "en-GB";
    if (unit === "month") return d.toLocaleDateString(locale, { month: "short" });
    if (points.length <= 7) return d.toLocaleDateString(locale, { weekday: "short" });
    return String(d.getDate());
  };
  return (
    <div className="trend" role="img" aria-label={`${formatNumber(r.sales)} LBP`}>
      {points.map((p, i) => (
        <div
          key={p.at}
          title={`${formatDate(p.at)}: ${formatNumber(p.sales)} (${formatUsdless(p.sales)})`}
        >
          <b>{roomy && p.sales !== 0 ? <Ltr>{(p.sales / 1e6).toFixed(1)}</Ltr> : ""}</b>
          <div className="column" style={{ height: `${(Math.max(0, p.sales) / max) * 150}px` }} />
          <span className="soft">{i % every === 0 ? name(p.at) : ""}</span>
        </div>
      ))}
    </div>
  );
}

const formatUsdless = (lbp: number) => `${(lbp / 1e6).toFixed(2)}M`;
export const cashText = (r: Sales) =>
  `${formatUsd(r.cash.usd_cents)} + ${formatNumber(r.cash.lbp)}`;
