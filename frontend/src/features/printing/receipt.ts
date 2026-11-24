import bold from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2?url";
import regular from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2?url";
import latinBold from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2?url";
import latinRegular from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2?url";
import logo from "../../assets/logo_mono.png";
import { formatDateTime, formatNumber, formatUsd } from "../../shared/format";
import type { PrinterSettings, Receipt } from "../../shared/types";

/* Receipts are Arabic only (D17), so these words are not in the translation files. */
const TYPE = { takeaway: "استلام", dine_in: "صالة", delivery: "دلفري" };
const STATUS = {
  paid: "مدفوع",
  unpaid: "غير مدفوع",
  partial: "مدفوع جزئياً",
  refunded: "مسترجع",
};
const SIZE = { small: 11, medium: 13, large: 15 };

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const ltr = (text: string) => `<bdi dir="ltr">${escapeHtml(text)}</bdi>`;
const lbp = (value: number) => `${ltr(formatNumber(value))} ل.ل`;
const row = (label: string, value: string, css = "") =>
  `<div class="row ${css}"><span>${label}</span><span class="v">${value}</span></div>`;
const absolute = (url: string) => new URL(url, window.location.href).href;

function cash(amount: { usd_cents: number; lbp: number }): string {
  const parts = [];
  if (amount.usd_cents) parts.push(ltr(formatUsd(amount.usd_cents)));
  if (amount.lbp || !parts.length) parts.push(lbp(amount.lbp));
  return parts.join(" + ");
}

export function receiptBody(r: Receipt, p: PrinterSettings, copy: boolean): string {
  const out: string[] = [];
  if (p.show_logo) {
    out.push(`<img src="${absolute(logo)}" style="width:${p.logo_percent}%" alt="">`);
  }
  out.push(`<div class="c name">${escapeHtml(r.shop.name)}</div>`);
  if (p.show_address && r.shop.address) {
    out.push(`<div class="c">${escapeHtml(r.shop.address)}</div>`);
  }
  if (p.show_phone && r.shop.phone) out.push(`<div class="c">${ltr(r.shop.phone)}</div>`);
  if (copy) out.push(`<div class="stamp">نسخة</div>`);
  out.push("<hr>");

  const type = r.table_no ? `${TYPE[r.type]}، طاولة ${r.table_no}` : TYPE[r.type];
  out.push(row(`<b>${type}</b>`, `<b>${ltr(`#${r.number}`)}</b>`, "big"));
  out.push(
    row(ltr(formatDateTime(r.time)), p.show_cashier ? `<bdi>${escapeHtml(r.cashier)}</bdi>` : ""),
  );
  out.push(row("رمز الفاتورة", `<b>${ltr(r.code)}</b>`), "<hr>");

  if (r.delivery) {
    const d = r.delivery;
    out.push(`<div><b><bdi>${escapeHtml(d.customer)}</bdi></b></div>`);
    out.push(`<div>${ltr(d.phone)}</div><div><bdi>${escapeHtml(d.address)}</bdi></div>`);
    out.push(row("السائق", `<b><bdi>${escapeHtml(d.driver)}</bdi></b>`));
    if (d.requested_time)
      out.push(row("الوقت المطلوب", `<bdi>${escapeHtml(d.requested_time)}</bdi>`));
    if (d.promised_time)
      out.push(row("الموعد", `<b><bdi>${escapeHtml(d.promised_time)}</bdi></b>`));
    out.push("<hr>");
  }

  for (const item of r.items) {
    const name = `<b>${ltr(`${item.qty}×`)} <bdi>${escapeHtml(item.name)}</bdi></b>`;
    out.push(row(name, ltr(formatNumber(item.total))));
    if (item.note) out.push(`<div class="note">- <bdi>${escapeHtml(item.note)}</bdi></div>`);
  }
  out.push("<hr>");

  if (r.delivery_fee) out.push(row("رسم الدلفري", lbp(r.delivery_fee)));
  if (r.promo) {
    const label = `خصم ${ltr(`${r.promo.code} (${r.promo.percent}%)`)}`;
    out.push(row(label, lbp(-r.discount)));
  }
  if (r.rounding) out.push(row("تدوير", lbp(r.rounding)));
  out.push(row("<b>المجموع</b>", `<b>${lbp(r.total)}</b>`, "big"));
  if (p.show_usd) out.push(row("بالدولار", ltr(formatUsd(r.total_usd_cents))));
  const cashIn = r.received.usd_cents || r.received.lbp;
  if (cashIn || r.wish) out.push("<hr>");
  if (cashIn) {
    out.push(row("المستلم", cash(r.received)));
    if (r.change.usd_cents || r.change.lbp) out.push(row("الباقي", cash(r.change)));
  }
  if (r.wish) out.push(row(`مدفوع عبر ${ltr("Wish")}`, lbp(r.wish)));
  if (r.status === "partial") out.push(row("<b>المتبقي</b>", `<b>${lbp(r.due)}</b>`));
  if (p.show_rate) out.push(row("سعر الصرف", lbp(r.rate)));
  out.push(`<div class="stamp">${STATUS[r.status]}</div>`);
  if (p.show_footer && r.shop.footer) {
    out.push(`<div class="c">${escapeHtml(r.shop.footer)}</div>`);
  }
  return out.join("");
}

const font = (url: string, weight: number, range: string) =>
  `@font-face{font-family:Receipt;font-weight:${weight};src:url("${absolute(url)}");unicode-range:${range}}`;
const ARABIC = "U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F";
const LATIN = "U+0000-00FF,U+2000-200B,U+2010-206F,U+2212,U+00D7";

/** The complete page that is previewed and printed. */
export function receiptHtml(r: Receipt, p: PrinterSettings, copy = false): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${font(regular, 400, ARABIC)}${font(bold, 700, ARABIC)}${font(latinRegular, 400, LATIN)}${font(latinBold, 700, LATIN)}
@page{margin:0}
*{box-sizing:border-box;margin:0}
body{width:${p.paper}mm;padding:2mm ${p.side_margin_mm}mm ${p.feed_mm}mm;background:#fff;color:#000;
font:${p.bold ? 700 : 400} ${SIZE[p.font_size]}px/1.45 Receipt,Tahoma,sans-serif;overflow-wrap:anywhere}
img{display:block;margin:0 auto 4px}
hr{border:0;border-top:1px dashed #000;margin:6px 0}
bdi{font-variant-numeric:tabular-nums}
b{font-weight:700}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:6px}
.row>span{min-width:0}.row>.v{flex:none;max-width:65%;text-align:end}
.big{font-size:1.3em}.c{text-align:center}.name{font-weight:700;font-size:1.15em}
.note{padding-inline-start:12px}
.stamp{border:2px solid #000;text-align:center;font-weight:700;font-size:1.15em;margin:6px 0}
</style></head><body>${receiptBody(r, p, copy)}</body></html>`;
}

/** For the Admin's preview; the real test page comes from the backend. */
export const sampleReceipt = (shop: Receipt["shop"], rate: number): Receipt => ({
  shop,
  status: "paid",
  type: "delivery",
  table_no: null,
  number: 27,
  code: "K7M4P",
  time: "2026-11-24T20:04:00",
  cashier: "سارة",
  items: [
    { name: "شاورما لحمة كبير", qty: 2, note: "بدون بصل", total: 1000000 },
    { name: "وجبة شاورما دجاج مع بطاطا وثوم إضافي", qty: 1, note: "", total: 450000 },
  ],
  delivery_fee: 100000,
  promo: { code: "GYROS10", percent: 10 },
  discount: 155000,
  rounding: 5000,
  total: 1400000,
  total_usd_cents: Math.ceil((1400000 * 100) / rate),
  paid: 1400000,
  due: 0,
  rate,
  wish: 0,
  received: { usd_cents: 1000, lbp: 600000 },
  change: { usd_cents: 0, lbp: 100000 },
  delivery: {
    customer: "علي حسن",
    phone: "03 000 000",
    address: "الهرمل، الحي الشرقي، قرب المدرسة",
    driver: "محمد",
    requested_time: "",
    promised_time: "8:30 PM",
  },
});
