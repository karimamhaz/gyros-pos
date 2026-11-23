import { expect, test } from "@playwright/test";
import path from "node:path";
import { button, launch } from "./app";

/** Renders the exact page that would be printed, at real paper width. */
test("receipts use the bundled Arabic font and fit both papers", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByLabel("اسم مستخدم المدير").fill("owner");
  await page.getByLabel("كلمة مرور المدير").fill("owner-pass");
  await page.getByLabel("أعد كتابة").fill("owner-pass");
  await page.getByLabel("1 دولار يساوي").fill("89500");
  await button(page, "إنشاء الحساب").click();
  await page.getByRole("checkbox").check();
  await button(page, "متابعة").click();
  await page.getByRole("button", { name: "المدير" }).click();
  await page.getByLabel("اسم المستخدم").fill("owner");
  await page.getByLabel("كلمة المرور").fill("owner-pass");
  await button(page, "دخول").click();
  await button(page, "الطابعة والفواتير").click();

  for (const paper of [80, 58]) {
    await page.getByText(`${paper} مم`).click();
    for (const size of ["صغير", "كبير"]) {
      await page.getByText(size, { exact: true }).click();
      const frame = page.frames().find((f) => f !== page.mainFrame())!;
      const body = page.frameLocator("iframe").locator("body");
      await expect
        .poll(() => body.evaluate((el) => Math.round(el.getBoundingClientRect().width)))
        .toBe(Math.round((paper / 25.4) * 96));
      const result = await frame.evaluate(async () => {
        await document.fonts.ready;
        const limit = document.body.getBoundingClientRect();
        return {
          fonts: [...document.fonts].filter((f) => f.status === "loaded").length,
          clipped: [...document.querySelectorAll("bdi, b, span, img, .stamp")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && (r.left < limit.left - 0.5 || r.right > limit.right + 0.5);
            })
            .map((el) => el.textContent),
        };
      });
      expect(result.fonts).toBeGreaterThanOrEqual(3);
      expect(result.clipped).toEqual([]);
      if (process.env.SHOTS) {
        await body.screenshot({
          path: path.join(process.env.SHOTS, `receipt-${paper}-${size}.png`),
        });
      }
    }
  }
  await app.close();
});
