import { describe, expect, test } from "vitest";
import type { PrinterSettings, Receipt } from "../../shared/types";
import { receiptBody, receiptHtml, sampleReceipt } from "./receipt";

const printer: PrinterSettings = {
  printer: "",
  paper: 80,
  copies: 1,
  auto_print: true,
  font_size: "medium",
  bold: false,
  side_margin_mm: 3,
  feed_mm: 8,
  show_logo: true,
  logo_percent: 60,
  show_usd: true,
  show_rate: true,
  show_cashier: true,
  show_address: true,
  show_phone: true,
  show_footer: true,
};
const shop = { name: "GYROS", phone: "76022164", address: "عنوان المطعم", footer: "الطعم الطيب" };
const sample = (over: Partial<Receipt> = {}): Receipt => ({
  ...sampleReceipt(shop, 89500),
  ...over,
});
const page = (html: string) => new DOMParser().parseFromString(html, "text/html");
const hidden = Object.fromEntries(
  Object.keys(printer)
    .filter((k) => k.startsWith("show_"))
    .map((k) => [k, false]),
);

describe("receipt page", () => {
  test("names and notes are shown as text and can never run as code", () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const r = sample({
      cashier: evil,
      items: [{ name: evil, qty: 1, note: evil, total: 1000 }],
      delivery: { ...sample().delivery!, customer: evil, address: evil, driver: evil },
      shop: { ...shop, name: evil, footer: evil },
    });
    const doc = page(receiptHtml(r, printer));
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelectorAll("[onerror]")).toHaveLength(0);
    expect(doc.body.textContent).toContain("<script>alert(2)</script>");
  });

  test("the code, the payment status and the copy mark cannot be switched off", () => {
    const body = receiptBody(sample(), { ...printer, ...hidden }, true);
    expect(body).toContain("K7M4P");
    expect(body).toContain("مدفوع");
    expect(body).toContain("نسخة");
    for (const word of [
      "الشعار",
      "سعر الصرف",
      "الطعم الطيب",
      "بالدولار",
      "76022164",
      "عنوان المطعم",
    ]) {
      expect(body).not.toContain(word);
    }
    expect(receiptBody(sample(), printer, false)).not.toContain("نسخة");
  });

  test("each status prints its own word", () => {
    const word = (status: Receipt["status"]) => receiptBody(sample({ status }), printer, false);
    expect(word("unpaid")).toContain("غير مدفوع");
    expect(word("partial")).toContain("مدفوع جزئياً");
    expect(word("refunded")).toContain("مسترجع");
  });

  test("delivery shows the customer, the driver and the notes; other types do not", () => {
    const delivery = receiptBody(sample(), printer, false);
    for (const text of ["علي حسن", "محمد", "8:30 PM", "بدون بصل", "رسم الدلفري"]) {
      expect(delivery).toContain(text);
    }
    const takeaway = receiptBody(
      sample({ type: "takeaway", delivery: null, delivery_fee: 0 }),
      printer,
      false,
    );
    expect(takeaway).not.toContain("السائق");
    expect(takeaway).not.toContain("رسم الدلفري");
  });

  test("a table bill names its table; a partial payment shows what is left", () => {
    expect(receiptBody(sample({ type: "dine_in", table_no: 4 }), printer, false)).toContain(
      "صالة، طاولة 4",
    );
    const partial = receiptBody(sample({ status: "partial", due: 250000 }), printer, false);
    expect(partial).toContain("المتبقي");
    expect(partial).toContain("250,000");
  });

  test.each([58, 80] as const)("the %s mm paper sets the page width", (paper) => {
    const html = receiptHtml(sample(), { ...printer, paper });
    expect(html).toContain(`width:${paper}mm`);
    expect(html).toContain('dir="rtl"');
  });

  test("text size, weight and margins follow the Admin's choices", () => {
    const html = receiptHtml(sample(), {
      ...printer,
      font_size: "large",
      bold: true,
      side_margin_mm: 6,
      feed_mm: 20,
    });
    expect(html).toContain("padding:2mm 6mm 20mm");
    expect(html).toContain("font:700 15px");
  });

  test("amounts keep Latin digits and the minus sign for a discount", () => {
    const body = receiptBody(sample(), printer, false);
    expect(body).toContain("1,400,000");
    expect(body).toMatch(/−155,000/);
    expect(body).not.toMatch(/[٠-٩]/);
  });
});
