import { expect, test, type Page } from "@playwright/test";
import { audit } from "./layout";
import { button, launch, snap } from "./app";
import { ADMIN_PASSWORD, resize, seed } from "./seed";

const SIZES: [number, number][] = [
  [1024, 640],
  [1280, 720],
  [1366, 768],
  [1536, 864],
  [1920, 1080],
];
const ADMIN_PAGES = [
  "المبيعات",
  "الطلبات",
  "المنتجات",
  "أكواد الخصم",
  "الورديات",
  "حسابات الكاشير",
  "الطابعة والفواتير",
  "الإعدادات",
  "النسخ الاحتياطي",
];

const problems: string[] = [];
async function check(page: Page, where: string) {
  await page.waitForTimeout(150);
  await snap(page, where.replace(/[^\w]+/g, "-"));
  for (const p of await audit(page)) problems.push(`${where}: ${p}`);
}

async function journey(page: Page, label: string) {
  await check(page, `${label} start`);
  await page.getByRole("button", { name: "كاشير" }).click();
  await page.getByRole("radio", { name: "سارة" }).click();
  await page.getByLabel("كلمة المرور").click();
  await check(page, `${label} login keyboard`);
  await page.getByTestId("keyboard").getByText("تم", { exact: true }).click();
  await page.getByLabel("كلمة المرور").fill("1234");
  await button(page, "دخول").click();
  await check(page, `${label} open shift`);
  await page.getByLabel("الدولار في الدرج").fill("20");
  await button(page, "بدء الوردية").click();
  for (const i of [0, 1, 3, 4, 5]) await page.locator(".tile").nth(i).click();
  await check(page, `${label} order`);
  await button(page, "دلفري").click();
  await check(page, `${label} delivery form`);
  await page.getByLabel("العنوان الكامل").click();
  await check(page, `${label} delivery keyboard`);
  await page.getByTestId("keyboard").getByText("تم", { exact: true }).click();
  await button(page, "رجوع إلى المنتجات").first().click();
  await button(page, "استلام").click();
  await button(page, "الدفع").click();
  await check(page, `${label} payment`);
  await button(page, "رجوع إلى الطلب").click();
  await page.locator(".topbar nav").getByText("الطاولات").click();
  await check(page, `${label} tables`);
  await page.locator(".table-tile").first().click();
  await page.locator(".tile").first().click();
  await check(page, `${label} table order`);
  await page.locator(".topbar nav").getByText("بحث عن طلب").click();
  await check(page, `${label} find`);
  await button(page, "إنهاء الوردية").click();
  await page.getByLabel("كلمة المرور الخاصة بك").click();
  await check(page, `${label} end shift keyboard`);
}

for (const [w, h] of SIZES) {
  test(`cashier screens at ${w}x${h}`, async () => {
    test.setTimeout(120_000);
    const app = await launch();
    const page = await app.firstWindow();
    await seed(page);
    await resize(page, w, h);
    problems.length = 0;
    await journey(page, `${w}x${h}`);
    expect(problems).toEqual([]);
    await app.close();
  });

  test(`Admin screens at ${w}x${h}`, async () => {
    test.setTimeout(120_000);
    const app = await launch();
    const page = await app.firstWindow();
    await seed(page);
    await resize(page, w, h);
    problems.length = 0;
    await page.getByRole("button", { name: "المدير" }).click();
    await page.getByLabel("اسم المستخدم").fill("owner");
    await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
    await button(page, "دخول").click();
    for (const name of ADMIN_PAGES) {
      await button(page, name).click();
      await check(page, `${w}x${h} ${name}`);
    }
    await button(page, "المنتجات").click();
    await page.getByRole("row", { name: "لبن" }).getByText("تعديل").click();
    await check(page, `${w}x${h} product editor`);
    await button(page, "الإعدادات").click();
    await page.getByLabel("عدد الطاولات").click();
    await check(page, `${w}x${h} settings keyboard`);
    expect(problems).toEqual([]);
    await app.close();
  });
}

test("English at 1366x768", async () => {
  test.setTimeout(120_000);
  const app = await launch();
  const page = await app.firstWindow();
  await seed(page);
  await resize(page, 1366, 768);
  problems.length = 0;
  await button(page, "English").click();
  await page.getByRole("button", { name: "Cashier" }).click();
  await page.getByRole("radio").first().click();
  await page.getByLabel("Password").fill("1234");
  await button(page, "Log in").click();
  await check(page, "en open shift");
  await button(page, "Start shift").click();
  await page.locator(".tile").first().click();
  await check(page, "en order");
  await button(page, "Delivery").click();
  await check(page, "en delivery");
  expect(problems).toEqual([]);
  await app.close();
});
