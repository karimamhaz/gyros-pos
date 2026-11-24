import type { Key, Lang } from "../../i18n";
import { formatDate, formatNumber } from "../../shared/format";
import { cashText, type Sales } from "./SalesPage";

const safe = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The same figures as the screen, for paper. */
export function salesHtml(r: Sales, lang: Lang, t: (key: Key) => string): string {
  const n = (v: number) => `<bdi dir="ltr">${formatNumber(v)}</bdi>`;
  const row = (label: string, value: string) => `<tr><td>${safe(label)}</td><td>${value}</td></tr>`;
  const table = (title: string, rows: string[]) =>
    `<h2>${safe(title)}</h2><table>${rows.join("")}</table>`;
  const summary = [
    row(`${t("sales.total")} (${t("lbp")})`, `<b>${n(r.sales)}</b>`),
    row(t("sales.fees"), n(r.delivery_fees)),
    row(t("sales.orders"), n(r.orders)),
    row(t("sales.refunded_orders"), n(r.refunds)),
    row(t("sales.outstanding"), n(r.outstanding)),
    row(t("sales.cash"), `<bdi dir="ltr">${cashText(r)}</bdi>`),
    row(t("sales.wish"), n(r.wish)),
  ];
  if (r.profit) {
    summary.push(
      row(t("sales.logged"), n(r.profit.logged)),
      row(`${t("sales.profit")} (${t("sales.profit_note")})`, n(r.profit.profit)),
    );
  }
  return `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<style>body{font:14px Tahoma,sans-serif;margin:24px}table{width:100%;border-collapse:collapse;margin-bottom:16px}
td{border-bottom:1px solid #ccc;padding:5px 8px;text-align:start}td:last-child{text-align:end}h2{font-size:16px;break-after:avoid}tr{break-inside:avoid}</style></head><body>
<h1>${safe(t("admin.sales"))}</h1><p><bdi dir="ltr">${formatDate(r.start)} – ${formatDate(r.end)}</bdi></p>
${table(t("admin.sales"), summary)}
${table(
  t("sales.by_type"),
  (["takeaway", "dine_in", "delivery"] as const).map((k) => row(t(`type.${k}`), n(r.by_type[k]))),
)}
${table(
  t("sales.by_cashier"),
  r.by_cashier.map((c) => row(c.name, n(c.sales))),
)}
${table(
  t(r.trend.unit === "day" ? "sales.by_day_plain" : "sales.by_month_plain"),
  r.trend.points.map((p) => row(formatDate(p.at), n(p.sales))),
)}
${table(
  t("sales.quantities"),
  r.products.map((p) => row(p.name, n(p.qty))),
)}
</body></html>`;
}
