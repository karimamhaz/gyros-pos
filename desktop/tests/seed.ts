import type { Page } from "@playwright/test";

export const ADMIN_PASSWORD = "owner-pass";
const CSV = [
  "name,category,price_lbp,available",
  ...[
    [
      "شاورما اللحمة",
      [
        ["شاورما لحمة وسط", 400],
        ["شاورما لحمة كبير", 500],
        ["شاورما لحمة دوبل", 700],
      ],
    ],
    [
      "شاورما الدجاج",
      [
        ["شاورما دجاج وسط", 300],
        ["شاورما دجاج كبير", 350],
        ["شاورما دجاج دوبل", 450],
      ],
    ],
    [
      "الوجبات",
      [
        ["فروج مع سرفيس", 900],
        ["وجبة شاورما دجاج", 450],
        ["وجبة شاورما لحمة", 700],
      ],
    ],
    [
      "البطاطا",
      [
        ["سندويش بطاطا صغير", 200],
        ["سندويش بطاطا كبير", 250],
        ["علبة بطاطا صغير", 150],
      ],
    ],
    [
      "المشروبات",
      [
        ["مشروبات غازية", 100],
        ["لبن", 70],
      ],
    ],
    [
      "سندويش الدجاج",
      [
        ["سندويش دجاج وسط", 300],
        ["سندويش دجاج كبير", 450],
      ],
    ],
    ["الإضافات", [["علبة توم إضافية", 50]]],
  ].flatMap(([category, items]) =>
    (items as [string, number][]).map(([n, p]) => `${n},${category},${p * 1000},yes`),
  ),
].join("\n");

/** Sets the restaurant up through the API, so a test can start at the screen it cares about. */
export async function seed(page: Page, options: { table_count?: number } = {}) {
  await page.waitForFunction(() => fetch("/api/health").then((r) => r.ok));
  await page.evaluate(
    async ({ csv, password, table_count }) => {
      const call = async (method: string, path: string, body?: unknown, token = "") => {
        const r = await fetch(`/api${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
        return r.json();
      };
      await call("POST", "/auth/setup", { username: "owner", password, rate: 89500 });
      const { token } = await call("POST", "/auth/login/admin", { username: "owner", password });
      const upload = { filename: "menu.csv", content: btoa(unescape(encodeURIComponent(csv))) };
      const preview = await call("POST", "/menu/import/preview", upload, token);
      await call(
        "POST",
        "/menu/import/apply",
        { ...upload, mode: "add", menu_version: preview.menu_version },
        token,
      );
      const settings = await call("GET", "/settings", undefined, token);
      delete settings.rate;
      await call(
        "PUT",
        "/settings",
        { ...settings, table_count, default_delivery_fee: 100000 },
        token,
      );
      for (const [username, display_name] of [
        ["sara", "سارة"],
        ["ahmad", "أحمد"],
      ]) {
        await call("POST", "/cashiers", { username, display_name, password: "1234" }, token);
      }
      await call("POST", "/promos", { code: "GYROS10", percent: 10 }, token);
      await call("POST", "/auth/logout", { password }, token);
    },
    { csv: CSV, password: ADMIN_PASSWORD, table_count: options.table_count ?? 12 },
  );
  await page.reload();
}

/** Any size, also bigger than this machine's screen. */
export async function resize(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
}
