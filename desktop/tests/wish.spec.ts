import { expect, test, type Page } from "@playwright/test";
import { button, launch } from "./app";
import { audit } from "./layout";
import { ADMIN_PASSWORD, resize, seed } from "./seed";

const product = (page: Page, name: string) =>
  page.locator(".tile").filter({ has: page.getByText(name, { exact: true }) });
const pad = (page: Page, key: string) =>
  page.locator(".pad").getByText(key, { exact: true }).click();

async function startShift(page: Page) {
  await page.getByRole("button", { name: "كاشير" }).click();
  await page.getByRole("radio", { name: "سارة" }).click();
  await page.getByLabel("كلمة المرور").fill("1234");
  await button(page, "دخول").click();
  await button(page, "بدء الوردية").click();
}

async function endShift(page: Page) {
  await button(page, "إنهاء الوردية").click();
  await page.getByLabel("الدولار في الدرج").fill("0");
  await page.getByLabel("الليرة في الدرج").fill("0");
  await page.getByLabel("كلمة المرور الخاصة بك").fill("1234");
  await button(page, "إنهاء الوردية والخروج").click();
  await button(page, "إنهاء").click();
}

async function adminLogin(page: Page) {
  await page.getByRole("button", { name: "المدير" }).click();
  await page.getByLabel("اسم المستخدم").fill("owner");
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await button(page, "دخول").click();
}

async function payByWish(page: Page) {
  await button(page, "الدفع").click();
  await button(page, "Wish").click();
  await button(page, "تأكيد وصول الدفعة عبر Wish").click();
  await expect(page.getByText("تم الدفع", { exact: true })).toBeVisible();
  await expect(page.getByText("تم تسجيل الدفع عبر Wish")).toBeVisible();
  await button(page, "بدون طباعة").click();
  await button(page, "طلب جديد").last().click();
}

test("the whole bill is already filled in as LBP, and typing dollars swaps it", async () => {
  test.setTimeout(120_000);
  const app = await launch();
  const page = await app.firstWindow();
  await seed(page);
  await startShift(page);
  await product(page, "شاورما لحمة كبير").click();
  await product(page, "لبن").click();
  await button(page, "الدفع").click();

  const lbp = page.getByLabel("المبلغ المستلم بالليرة");
  const usd = page.getByLabel("المبلغ المستلم بالدولار");
  await expect(lbp).toHaveValue("570,000");
  await expect(page.getByText("المبلغ كامل")).toBeVisible();
  await expect(button(page, "تأكيد الدفع")).toBeEnabled(); // one tap pays the usual way

  // Dollars take the place of the suggestion, and clearing them brings it back.
  await usd.click();
  await pad(page, "7");
  await expect(lbp).toHaveValue("");
  await pad(page, "حذف");
  await expect(lbp).toHaveValue("570,000");

  // Typing LBP herself replaces it completely, and dollars no longer clear it.
  await lbp.click();
  await pad(page, "2");
  await pad(page, "000");
  await expect(lbp).toHaveValue("2,000");
  await usd.click();
  await pad(page, "1");
  await expect(lbp).toHaveValue("2,000");
  await app.close();
});

test("an order recorded as paid by Wish counts no cash, and Admin sees it apart", async () => {
  test.setTimeout(150_000);
  const app = await launch();
  const page = await app.firstWindow();
  await seed(page);
  await resize(page, 1366, 768);
  await startShift(page);
  await product(page, "شاورما لحمة كبير").click();
  await product(page, "وجبة شاورما دجاج").click();
  await button(page, "الدفع").click();
  await button(page, "Wish").click();
  await expect(page.getByText("الدفع عبر Wish")).toBeVisible();
  await expect(page.getByText("950,000").first()).toBeVisible();
  await expect(page.getByLabel("المبلغ المستلم بالليرة")).toHaveCount(0); // no cash to count
  expect(await audit(page)).toEqual([]);
  await button(page, "تأكيد وصول الدفعة عبر Wish").click();
  await expect(page.getByText("تم تسجيل الدفع عبر Wish")).toBeVisible();
  await expect(page.getByText("الباقي للزبون")).toHaveCount(0);
  await button(page, "بدون طباعة").click();
  await button(page, "طلب جديد").last().click();

  // A cash sale next to it, so the two can be told apart.
  await product(page, "لبن").click();
  await button(page, "الدفع").click();
  await button(page, "تأكيد الدفع").click();
  await expect(page.getByText("تم الدفع", { exact: true })).toBeVisible();
  await button(page, "بدون طباعة").click();
  await button(page, "طلب جديد").last().click();
  await endShift(page);

  await adminLogin(page);
  const cashBox = page.locator(".box").filter({ hasText: "النقد المستلم" });
  await expect(cashBox.getByText("950,000")).toBeVisible(); // beside the cash lines, not in them
  await expect(cashBox.getByText("70,000")).toBeVisible();
  await button(page, "الطلبات").click();
  await expect(page.getByRole("row", { name: /Wish/ })).toHaveCount(1);
  await button(page, "الورديات").click();
  await page.getByRole("row", { name: "سارة" }).getByText("عرض").click();
  const review = page.locator(".box").filter({ hasText: "المتوقع" });
  await expect(review.getByText("مدفوع عبر Wish")).toBeVisible();
  await expect(review.getByText("950,000")).toBeVisible();
  await expect(review.getByText("الفرق").locator("..")).toContainText("−70,000"); // cash only
  await app.close();
});

test("refunding a Wish order gives no cash, and the drawer still balances", async () => {
  test.setTimeout(150_000);
  const app = await launch();
  const page = await app.firstWindow();
  await seed(page);
  await startShift(page);
  await product(page, "لبن").click();
  await payByWish(page);
  await endShift(page);

  // Admin works a shift of their own, then refunds the order from the order list.
  await adminLogin(page);
  await button(page, "أخذ طلب").click();
  await button(page, "بدء الوردية").click();
  await button(page, "المدير").click();
  await button(page, "الطلبات").click();
  await page.getByRole("row", { name: /Wish/ }).getByText("عرض").click();
  await expect(page.getByText("مدفوع عبر Wish").first()).toBeVisible();
  await button(page, "استرجاع المبلغ").click();
  await expect(page.getByText("دُفع عبر Wish")).toBeVisible();
  await expect(page.getByLabel("أعطِ دولار")).toHaveCount(0); // nothing to count out
  await page.getByText("خطأ في الطلب").click();
  await page.getByRole("dialog").getByRole("button", { name: "موافقة" }).click();
  await expect(page.getByRole("dialog").locator(".tag", { hasText: "مسترجع" })).toBeVisible();
  await page.keyboard.press("Escape");

  await button(page, "الورديات").click();
  await page.getByRole("row", { name: "سارة" }).getByText("عرض").click();
  const review = page.locator(".box").filter({ hasText: "المتوقع" });
  await expect(review.getByText("مدفوع عبر Wish").locator("..")).toContainText("0"); // paid, then refunded
  await app.close();
});
