import { expect, test } from "@playwright/test";
import { button, launch } from "./app";
import { fits } from "./app";
import { audit } from "./layout";
import { resize, seed } from "./seed";

// Regression: the banknote columns overlapped and spilled out of the card, and the order
// footer (discount code, total, Pay) was pushed past the edge of its panel.
for (const [w, h] of [
  [1000, 560],
  [1093, 614],
  [1366, 768],
  [1920, 1080],
]) {
  test(`money entry and order footer fit at ${w}x${h}`, async () => {
    test.setTimeout(120_000);
    const app = await launch();
    const page = await app.firstWindow();
    await resize(page, w, h);
    await seed(page);
    await page.evaluate(async () => {
      const call = async (method: string, path: string, body?: unknown, token = "") => {
        const r = await fetch(`/api${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!r.ok) throw new Error(path);
        return r.json();
      };
      const { token } = await call("POST", "/auth/login/admin", {
        username: "owner",
        password: "owner-pass",
      });
      const settings = await call("GET", "/settings", undefined, token);
      delete settings.rate;
      await call("PUT", "/settings", { ...settings, count_mode: "banknotes" }, token);
      await call("POST", "/auth/logout", { password: "owner-pass" }, token);
    });
    await page.reload();
    await page.getByRole("button", { name: "كاشير" }).click();
    await page.getByRole("radio", { name: "سارة" }).click();
    await page.getByLabel("كلمة المرور").fill("1234");
    await button(page, "دخول").click();

    // Two equal columns that stay inside the card; no note above 100,000.
    const inputs = page.locator(".note-row input");
    await expect(inputs).toHaveCount(13);
    await expect(
      page.locator(".note-row .label", { hasText: /^1,000,000$|^500,000$/ }),
    ).toHaveCount(0);
    const card = await page
      .locator(".note-row")
      .first()
      .locator("xpath=ancestor::*[contains(@class,'card')][1]")
      .boundingBox();
    for (let i = 0; i < 13; i++) {
      const box = (await inputs.nth(i).boundingBox())!;
      if (card) {
        expect(box.x).toBeGreaterThanOrEqual(card.x);
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
      }
    }
    // The card scrolls on short windows, so only alignment and sideways overflow are judged.
    expect(await audit(page)).toEqual([]);
    await inputs.first().click();
    await page.waitForTimeout(400); // the page scrolls the field above the keyboard
    expect(await audit(page)).toEqual([]);
    await page.getByTestId("keyboard").getByText("تم", { exact: true }).click();
    await button(page, "بدء الوردية").click();

    await page.locator(".tile").first().click();
    await fits(page);
    const foot = (await page.locator(".ticket-foot").boundingBox())!;
    for (const el of await page.locator(".ticket-foot button, .ticket-foot input").all()) {
      const b = (await el.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(foot.x);
      expect(b.x + b.width).toBeLessThanOrEqual(foot.x + foot.width);
    }
    await app.close();
  });
}
