import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { button, dataDir, fits, launch, snap } from "./app";

const MENU = path.resolve(__dirname, "../../docs/gyros_menu.csv");
const ADMIN = "owner-pass";

async function setUp(page: Page) {
  await page.getByLabel("اسم مستخدم المدير").fill("owner");
  await page.getByLabel("كلمة مرور المدير").fill(ADMIN);
  await page.getByLabel("أعد كتابة").fill(ADMIN);
  await page.getByLabel("1 دولار يساوي").fill("89500");
  await snap(page, "setup");
  await button(page, "إنشاء الحساب").click();
  await expect(page.getByText("مفتاح الاستعادة").first()).toBeVisible();
  await snap(page, "recovery-key");
  await page.getByRole("checkbox").check();
  await button(page, "متابعة").click();
}

async function adminLogin(page: Page) {
  await page.getByRole("button", { name: "المدير" }).click();
  await page.getByLabel("اسم المستخدم").fill("owner");
  await page.getByLabel("كلمة المرور").fill(ADMIN);
  await button(page, "دخول").click();
  await expect(page.getByRole("heading", { name: "المبيعات", exact: true })).toBeVisible();
}

const product = (page: Page, name: string) =>
  page.locator(".tile").filter({ has: page.getByText(name, { exact: true }) });
const tab = (page: Page, name: string) => page.locator(".topbar nav").getByText(name).click();

test("a full day, in Arabic", async () => {
  test.setTimeout(240_000);
  const dir = dataDir();
  const app = await launch(dir);
  const page = await app.firstWindow();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  await page.setViewportSize({ width: 1366, height: 768 });

  await setUp(page);
  await snap(page, "start");
  await fits(page);
  await adminLogin(page);
  await snap(page, "sales-empty");

  // Menu from the restaurant's file
  await button(page, "المنتجات").click();
  await button(page, "استيراد").click();
  await page.locator("input[type=file]").setInputFiles(MENU);
  await expect(page.getByText("جديد 17")).toBeVisible();
  await snap(page, "import");
  await page.getByRole("button", { name: /^تطبيق/ }).click();
  await expect(page.getByText("تمت إضافة 17")).toBeVisible();
  await button(page, "رجوع").click();
  await page.getByRole("row", { name: "شاورما لحمة كبير" }).getByText("تعديل").click();
  await snap(page, "products");
  await fits(page);
  await button(page, "التصنيفات").click();
  await snap(page, "categories");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Settings
  await button(page, "الإعدادات").click();
  await page.getByLabel("عدد الطاولات").fill("12");
  await page.getByLabel("رسم الدلفري الافتراضي").fill("100000");
  for (const group of ["المخزون", "المصاريف والتكاليف"]) {
    await page.getByRole("group", { name: group }).getByText("مفعل").click();
  }
  await snap(page, "settings");
  await button(page, "حفظ التغييرات").click();
  await expect(page.getByText("تم الحفظ")).toBeVisible();
  await fits(page);

  await button(page, "الطابعة والفواتير").click();
  await expect(page.frameLocator("iframe").getByText("رمز الفاتورة")).toBeVisible();
  await snap(page, "printer");
  await fits(page);
  await page.getByText("الشعار", { exact: true }).click();
  await expect(page.frameLocator("iframe").locator("img")).toHaveCount(0);
  await page.getByText("58 مم").click();
  await snap(page, "printer-58");
  await page.getByText("80 مم").click();
  await page.getByText("الشعار", { exact: true }).click();
  await button(page, "حفظ وطباعة تجريبية").click();
  await expect(page.getByText("لم يحدد المدير الطابعة بعد")).toBeVisible();
  await button(page, "بدون طباعة").click();

  await button(page, "أكواد الخصم").click();
  await button(page, "كود جديد").click();
  await page.getByLabel("الكود").fill("gyros10");
  await page.getByLabel("نسبة الخصم").fill("10");
  await button(page, "حفظ").click();
  await expect(page.getByRole("cell", { name: "GYROS10" })).toBeVisible();
  await snap(page, "promos");

  await button(page, "حسابات الكاشير").click();
  for (const [name, user] of [
    ["سارة", "sara"],
    ["أحمد", "ahmad"],
  ]) {
    await button(page, "كاشير جديد").click();
    await page.getByLabel("الاسم", { exact: true }).fill(name);
    await page.getByLabel("اسم المستخدم").fill(user);
    await page.getByLabel("كلمة المرور").fill("1234");
    await button(page, "حفظ").click();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  }
  await snap(page, "cashiers");

  await button(page, "المخزون").click();
  await button(page, "صنف جديد").click();
  await page.getByLabel("الاسم", { exact: true }).fill("علب بيبسي");
  await page.getByLabel("منتج القائمة المرتبط").selectOption({ label: "مشروبات غازية" });
  await page.getByLabel("حد التنبيه").fill("24");
  await button(page, "حفظ").click();
  await button(page, "إدخال").click();
  await page.getByLabel("الكمية", { exact: true }).fill("18");
  await button(page, "حفظ").click();
  await expect(page.getByText("كمية منخفضة")).toBeVisible();
  await snap(page, "inventory");

  await button(page, "المصاريف والتكاليف").click();
  await page.getByLabel("التصنيف").fill("مولد");
  await page.getByLabel("المبلغ").fill("250000");
  await button(page, "حفظ").click();
  await expect(page.getByRole("cell", { name: "مولد" })).toBeVisible();
  await snap(page, "expenses");
  await fits(page);

  await button(page, "تسجيل الخروج").click();
  await page.getByLabel("كلمة المرور").fill("wrong");
  await page.getByRole("dialog").getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page.getByText("كلمة المرور غير صحيحة")).toBeVisible();
  await page.getByLabel("كلمة المرور").fill(ADMIN);
  await page.getByRole("dialog").getByRole("button", { name: "تسجيل الخروج" }).click();

  // Cashier, using the touch keyboard
  const kb = page.getByTestId("keyboard");
  const press = (key: string) => kb.getByText(key, { exact: true }).click();
  await page.getByRole("button", { name: "كاشير" }).click();
  await expect(page.getByRole("radio")).toHaveCount(2);
  await snap(page, "login");
  await page.getByRole("radio", { name: "سارة" }).click();
  await page.getByLabel("كلمة المرور").click();
  await expect(kb).toBeVisible();
  await snap(page, "login-keyboard");
  for (const k of "1234") await press(k);
  await press("تم");
  await expect(kb).toBeHidden();
  await button(page, "دخول").click();
  await page.getByLabel("الدولار في الدرج").click();
  await expect(kb.getByText(".", { exact: true })).toBeVisible();
  await snap(page, "open-shift-keyboard");
  for (const k of ["2", "0"]) await press(k);
  await page.getByLabel("الليرة في الدرج").click();
  for (const k of ["1", "000", "000"]) await press(k);
  await expect(page.getByLabel("الليرة في الدرج")).toHaveValue("1,000,000");
  await press("تم");
  await snap(page, "open-shift");
  await button(page, "بدء الوردية").click();

  // Takeaway with a note, paid in both currencies
  for (const name of [
    "شاورما لحمة كبير",
    "شاورما لحمة كبير",
    "وجبة شاورما دجاج",
    "مشروبات غازية",
    "مشروبات غازية",
  ]) {
    await product(page, name).click();
  }
  await expect(product(page, "مشروبات غازية").getByText("كمية منخفضة")).toBeVisible();
  await page.locator(".item-name").first().click();
  await page.getByLabel("ملاحظة").click();
  await snap(page, "note-keyboard");
  await page.getByLabel("ملاحظة").fill("بدون بصل");
  await button(page, "حفظ").click();
  await expect(page.locator(".total")).toContainText("1,650,000");
  await expect(page.getByText("$18.44")).toBeVisible();
  await snap(page, "order");
  await fits(page);
  await button(page, "الدفع").click();
  const pad = (key: string) => page.locator(".pad").getByText(key, { exact: true }).click();
  for (const k of ["1", "0"]) await pad(k);
  await page.getByLabel("المبلغ المستلم بالليرة").click();
  for (const k of ["1", "000", "000"]) await pad(k);
  await expect(kb).toBeHidden();
  await page.getByText("أكثره دولار").click();
  await expect(page.getByText("70,000")).toBeVisible();
  await expect(page.getByText("$2.00")).toBeVisible();
  await snap(page, "payment");
  await fits(page);
  await button(page, "تأكيد الدفع").click();
  await expect(page.getByText("تم الدفع")).toBeVisible();
  await expect(page.getByText("لم يحدد المدير الطابعة بعد")).toBeVisible();
  await snap(page, "paid");
  await button(page, "طلب جديد").last().click();

  // An unfinished order survives changing pages
  await product(page, "لبن").click();
  await expect(page.locator(".total")).toContainText("70,000");
  await tab(page, "الطاولات");
  await snap(page, "tables-empty");
  await tab(page, "طلب جديد");
  await expect(page.locator(".item-name")).toHaveCount(1);
  await button(page, "إلغاء").click();
  await expect(page.locator(".item-name")).toHaveCount(0);

  // Delivery with a promo, sent unpaid
  await button(page, "دلفري").click();
  await page.getByLabel("اسم الزبون").fill("علي حسن");
  await page.getByLabel("رقم الهاتف").fill("03 000 000");
  await page.getByLabel("العنوان الكامل").fill("الهرمل، الحي الشرقي");
  await page.getByLabel("السائق", { exact: true }).fill("محمد");
  await snap(page, "delivery");
  await fits(page);
  await button(page, "رجوع إلى المنتجات").first().click();
  for (const name of ["شاورما دجاج كبير", "شاورما دجاج كبير", "علبة بطاطا صغير"]) {
    await product(page, name).click();
  }
  await expect(page.locator(".total")).toContainText("950,000");
  await page.getByLabel("كود الخصم").fill("gyros10");
  await button(page, "تطبيق").click();
  await expect(page.locator(".total")).toContainText("860,000");
  await snap(page, "delivery-promo");
  await fits(page);
  await button(page, "إرسال، الدفع لاحقاً").click();
  await expect(page.getByText("تم إرسال الطلب")).toBeVisible();
  await button(page, "بدون طباعة").click();
  await page.getByRole("dialog").getByText("طلب جديد").click();
  await tab(page, "الدلفري");
  await expect(page.getByText("860,000")).toBeVisible();
  await snap(page, "deliveries");
  await fits(page);

  // Dine-in: save, remove an item with approval, pay, still open, close
  await tab(page, "الطاولات");
  await page.locator(".table-tile").nth(1).click();
  await product(page, "فروج مع سرفيس").click();
  await expect(page.locator(".total")).toContainText("900,000");
  await button(page, "حفظ الجديد").click();
  await product(page, "علبة بطاطا صغير").click();
  await expect(page.locator(".total")).toContainText("1,050,000");
  await snap(page, "table-order");
  await fits(page);
  await button(page, "حفظ الجديد").click();
  await expect(button(page, "حفظ الجديد")).toBeDisabled();
  await page.locator(".item").nth(1).getByText("حذف").click();
  await page.getByText("خطأ في الطلب").click();
  await page.getByLabel("كلمة مرور المدير").fill("nope");
  await button(page, "موافقة").click();
  await expect(page.getByText("كلمة المرور غير صحيحة")).toBeVisible();
  await page.getByLabel("كلمة مرور المدير").fill(ADMIN);
  await snap(page, "approval");
  await button(page, "موافقة").click();
  await expect(page.locator(".total")).toContainText("900,000");
  await button(page, "كل الطاولات").click();
  await expect(page.locator(".table-tile.open")).toHaveCount(1);
  await snap(page, "tables");
  await page.locator(".table-tile").nth(1).click();
  await button(page, "الدفع").click();
  await button(page, "الباقي ليرة").click();
  await expect(page.getByText("المبلغ كامل")).toBeVisible();
  await button(page, "تأكيد الدفع").click();
  await button(page, "العودة إلى الطاولة").click();
  await expect(page.getByText("حساب جديد")).toBeVisible();
  await button(page, "كل الطاولات").click();
  await expect(page.locator(".table-tile.paid")).toHaveCount(1);
  await page.locator(".table-tile").nth(1).click();
  await button(page, "إغلاق الطاولة").click();
  await expect(page.locator(".table-tile.paid")).toHaveCount(0);

  // Quick Admin, then find order
  await button(page, "المدير").click();
  await page.getByLabel("كلمة مرور المدير").fill(ADMIN);
  await button(page, "دخول").click();
  await page.getByRole("row", { name: "لبن" }).getByText("إيقاف").click();
  await expect(page.getByRole("row", { name: "لبن" }).getByText("غير متاح")).toBeVisible();
  await snap(page, "quick-admin");
  await fits(page);
  await button(page, "العودة إلى الكاشير").click();
  await tab(page, "طلب جديد");
  await expect(product(page, "مشروبات غازية")).toHaveCount(1);
  await expect(product(page, "لبن")).toHaveCount(0);
  await tab(page, "بحث عن طلب");
  await page.getByLabel("رقم الطلب").fill("1");
  await page.getByLabel("رمز الفاتورة").fill("AAAAA");
  await button(page, "بحث").click();
  await expect(page.getByText("العنصر غير موجود")).toBeVisible();
  await snap(page, "find");

  await button(page, "إنهاء الوردية").click();
  await page.getByLabel("الدولار في الدرج").fill("28");
  await page.getByLabel("الليرة في الدرج").fill("2780000");
  await page.getByLabel("كلمة المرور الخاصة بك").fill("1234");
  await snap(page, "end-shift");
  await button(page, "إنهاء الوردية والخروج").click();
  const reference = (await page.getByTestId("reference").textContent())!.trim();
  expect(reference).toMatch(/^GX-/);
  await snap(page, "shift-closed");
  await button(page, "إنهاء").click();

  // Admin compares and sees sales
  await adminLogin(page);
  await expect(page.getByText("2,550,000").first()).toBeVisible();
  await expect(page.getByText("فقط مما سجلته كمصاريف وتكاليف")).toBeVisible();
  await snap(page, "sales");
  await page.getByText("الأسبوع").click();
  await expect(page.locator(".trend > div")).toHaveCount(7);
  await snap(page, "sales-week");
  await button(page, "الورديات").click();
  await page.getByRole("row", { name: "سارة" }).getByText("عرض").click();
  await expect(page.getByText(reference)).toBeVisible();
  await expect(page.getByText("−50,000")).toBeVisible();
  await snap(page, "shifts");
  await fits(page);
  await button(page, "الطلبات").click();
  await expect(page.getByRole("row")).toHaveCount(4);
  await snap(page, "orders");
  await page.getByRole("row", { name: "استلام" }).getByText("عرض").click();
  await snap(page, "order-details");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await button(page, "النسخ الاحتياطي").click();
  await expect(page.getByRole("row", { name: "سارة" })).toBeVisible();
  await snap(page, "backups");
  await button(page, "استعادة من نسخة").click();
  await snap(page, "restore");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  expect(readdirSync(path.join(dir, "Backups"))).toHaveLength(2);
  expect(problems).toEqual([]);
  await app.close();
});

test("the same screens in English", async () => {
  test.setTimeout(120_000);
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1366, height: 768 });
  await setUp(page);
  await button(page, "English").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await snap(page, "en-start");
  await page.getByRole("button", { name: "Admin" }).click();
  await page.getByLabel("Username").fill("owner");
  await page.getByLabel("Password").fill(ADMIN);
  await button(page, "Log in").click();
  await button(page, "Products").click();
  await button(page, "Import").click();
  await page.locator("input[type=file]").setInputFiles(MENU);
  await page.getByRole("button", { name: /^Apply/ }).click();
  await expect(page.getByText("Added 17")).toBeVisible();
  for (const name of [
    "Sales",
    "Orders",
    "Promo codes",
    "Shifts",
    "Cashiers",
    "Printer and receipts",
    "Settings",
    "Backups",
  ]) {
    await button(page, name).click();
    await snap(page, `en-${name}`);
    await fits(page);
  }
  await button(page, "Take an order").click();
  await button(page, "Start shift").click();
  await product(page, "شاورما لحمة كبير").click();
  await expect(page.locator(".total")).toContainText("500,000");
  await snap(page, "en-order");
  await fits(page);
  await button(page, "Pay").click();
  await button(page, "Rest in USD").click();
  await expect(
    page.getByText("Paid exactly").or(page.getByText("Change for the customer")),
  ).toBeVisible();
  await snap(page, "en-payment");
  await fits(page);
  await button(page, "Confirm payment").click();
  await expect(page.getByText("Payment saved")).toBeVisible();
  await app.close();
});

test("an unfinished order comes back after the app is killed", async () => {
  test.setTimeout(120_000);
  const dir = dataDir();
  const app = await launch(dir);
  const page = await app.firstWindow();
  await setUp(page);
  await adminLogin(page);
  await button(page, "المنتجات").click();
  await button(page, "استيراد").click();
  await page.locator("input[type=file]").setInputFiles(MENU);
  await page.getByRole("button", { name: /^تطبيق/ }).click();
  await expect(page.getByText("تمت إضافة 17")).toBeVisible();
  await button(page, "أخذ طلب").click();
  await button(page, "بدء الوردية").click();
  await product(page, "لبن").click();
  await expect(page.locator(".total")).toContainText("70,000");
  app.process().kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 1500));

  const again = await launch(dir);
  const next = await again.firstWindow();
  await adminLogin(next);
  await button(next, "أخذ طلب").click();
  await next.getByText("طلبات غير مكتملة (1)").click();
  await button(next, "متابعة").click();
  await expect(next.locator(".total")).toContainText("70,000");
  expect(readdirSync(path.join(dir, "Backups")).some((f) => f.includes("_recovery_"))).toBe(true);
  await again.close();
});
