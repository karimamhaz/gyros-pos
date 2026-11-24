import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { button, dataDir, launch } from "./app";
import { ADMIN_PASSWORD, seed } from "./seed";

const product = (page: Page, name: string) =>
  page.locator(".tile").filter({ has: page.getByText(name, { exact: true }) });

async function cashier(page: Page, name = "سارة") {
  await page.getByRole("button", { name: "كاشير" }).click();
  await page.getByRole("radio", { name }).click();
  await page.getByLabel("كلمة المرور").fill("1234");
  await button(page, "دخول").click();
}
async function admin(page: Page) {
  await page.getByRole("button", { name: "المدير" }).click();
  await page.getByLabel("اسم المستخدم").fill("owner");
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await button(page, "دخول").click();
}
async function sell(page: Page, item: string) {
  await product(page, item).click();
  await button(page, "الدفع").click();
  await button(page, "تأكيد الدفع").click();
  await expect(page.getByText("تم الدفع")).toBeVisible();
  const number = await page.getByText(/^طلب رقم \d+$/).textContent();
  await button(page, "طلب جديد").last().click();
  return Number(number!.replace(/\D/g, ""));
}

test("sales, numbers and the open shift survive the app being killed", async () => {
  test.setTimeout(150_000);
  const dir = dataDir();
  const app = await launch(dir);
  const page = await app.firstWindow();
  await seed(page);
  await cashier(page);
  await button(page, "بدء الوردية").click();
  expect(await sell(page, "لبن")).toBe(1);
  expect(await sell(page, "مشروبات غازية")).toBe(2);
  app.process().kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 1500));

  const again = await launch(dir);
  const next = await again.firstWindow();
  await next.getByRole("button", { name: "كاشير" }).click();
  await next.getByRole("radio", { name: "أحمد" }).click();
  await next.getByLabel("كلمة المرور").fill("1234");
  await button(next, "دخول").click();
  await expect(next.getByText("وردية سارة ما زالت مفتوحة")).toBeVisible(); // the shift is not lost
  await button(next, "رجوع").click();
  await next.getByRole("button", { name: "كاشير" }).click();
  await next.getByRole("radio", { name: "سارة" }).click();
  await next.getByLabel("كلمة المرور").fill("1234");
  await button(next, "دخول").click();
  expect(await sell(next, "لبن")).toBe(3); // numbering continues
  await button(next, "المدير").click();
  await next.getByLabel("كلمة مرور المدير").fill(ADMIN_PASSWORD);
  await button(next, "دخول").click();
  await expect(next.getByRole("row", { name: "لبن" })).toBeVisible();
  await again.close();
  expect(readdirSync(path.join(dir, "Backups")).some((f) => f.includes("_recovery_"))).toBe(true);
});

test("a backup can be restored from its screen and the data goes back", async () => {
  test.setTimeout(150_000);
  const dir = dataDir();
  const app = await launch(dir);
  const page = await app.firstWindow();
  await seed(page);
  const backups = path.join(dir, "Backups");
  const before = readdirSync(backups); // made when the setup session ended
  expect(before).toHaveLength(1);
  await cashier(page);
  await button(page, "بدء الوردية").click();
  await sell(page, "لبن");
  await button(page, "إنهاء الوردية").click();
  await page.getByLabel("كلمة المرور الخاصة بك").fill("1234");
  await button(page, "إنهاء الوردية والخروج").click();
  await button(page, "إنهاء").click();
  expect(readdirSync(backups)).toHaveLength(2);

  await admin(page);
  await button(page, "الطلبات").click();
  await expect(page.getByRole("row")).toHaveCount(2); // header and the sale
  await button(page, "النسخ الاحتياطي").click();
  await button(page, "استعادة من نسخة").click();
  await page.getByRole("button", { name: before[0] }).click();
  await page.getByRole("checkbox").check();
  await page.getByLabel("كلمة المرور الخاصة بك").fill(ADMIN_PASSWORD);
  await page.getByRole("dialog").getByRole("button", { name: "استعادة من نسخة" }).click();
  await expect(page.getByText("تمت الاستعادة")).toBeVisible();
  await button(page, "متابعة").click();
  await admin(page);
  await button(page, "الطلبات").click();
  await expect(page.getByText("لا توجد طلبات")).toBeVisible();
  expect(readdirSync(backups).some((f) => f.includes("_prerestore_"))).toBe(true);
  for (const file of before) expect(readdirSync(backups)).toContain(file); // none was touched
  await app.close();
});

test("everything works with no network at all", async () => {
  test.setTimeout(120_000);
  const dir = dataDir();
  const { _electron: electron } = await import("@playwright/test");
  const app = await electron.launch({
    args: [
      path.resolve(__dirname, ".."),
      `--user-data-dir=${dir}`,
      "--proxy-server=http://127.0.0.1:9",
    ],
    env: {
      ...(process.env as Record<string, string>),
      POS_DATA_DIR: path.join(dir, "Data"),
      POS_BACKUP_DIR: path.join(dir, "Backups"),
    },
  });
  const page = await app.firstWindow();
  const outside: string[] = [];
  page.on("request", (r) => !r.url().startsWith("app://") && outside.push(r.url()));
  await seed(page);
  await cashier(page);
  await button(page, "بدء الوردية").click();
  expect(await sell(page, "لبن")).toBe(1);
  expect(await page.evaluate(() => fetch("https://example.com").catch(() => "offline"))).toBe(
    "offline",
  );
  expect(outside).toEqual([]);
  await app.close();
});

test("a printer that is missing never loses the sale", async () => {
  test.setTimeout(120_000);
  const app = await launch();
  const page = await app.firstWindow();
  await seed(page);
  await cashier(page);
  await button(page, "بدء الوردية").click();
  await product(page, "لبن").click();
  await button(page, "الدفع").click();
  await button(page, "تأكيد الدفع").click();
  await expect(page.getByText("تم الدفع")).toBeVisible();
  await expect(page.getByText("لم يحدد المدير الطابعة بعد")).toBeVisible();
  await button(page, "بدون طباعة").click();
  await button(page, "طلب جديد").last().click();
  await page.locator(".topbar nav").getByText("بحث عن طلب").click();
  await expect(page.getByRole("heading", { name: "بحث عن طلب" })).toBeVisible();
  await app.close();
});
