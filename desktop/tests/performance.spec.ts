import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { button, launch } from "./app";
import { seed } from "./seed";

const processes = (pid: number): number[] => {
  const children = execSync(`pgrep -P ${pid} || true`)
    .toString()
    .split("\n")
    .filter(Boolean)
    .map(Number);
  return [pid, ...children.flatMap(processes)];
};
const breakdown = (pid: number) =>
  processes(pid)
    .map((p) => {
      const [rss, command] = execSync(`ps -o rss=,command= -p ${p} || echo 0`)
        .toString()
        .trim()
        .split(/\s+(.*)/);
      const kind =
        /--type=(\w[\w-]*)/.exec(command ?? "")?.[1] ??
        (/app\.main|gyros-backend/.test(command ?? "")
          ? "backend"
          : /uv run/.test(command ?? "")
            ? "uv"
            : "main");
      return `${kind} ${Math.round(Number(rss) / 1024)} MB`;
    })
    .join(", ");
const memoryMb = (pid: number) =>
  Math.round(
    processes(pid)
      .map((p) => Number(execSync(`ps -o rss= -p ${p} || echo 0`).toString().trim() || 0))
      .reduce((a, b) => a + b, 0) / 1024,
  );

test("start-up, ordering speed and memory with a long menu", async () => {
  test.setTimeout(180_000);
  const t0 = Date.now();
  const app = await launch();
  const page = await app.firstWindow();
  await page.getByRole("heading", { name: "الإعداد الأول" }).waitFor();
  const startup = Date.now() - t0;

  await seed(page);
  // Grow the menu to 600 products through the API.
  await page.evaluate(async () => {
    const call = async (method: string, path: string, body: unknown, token = "") => {
      const r = await fetch(`/api${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return r.json();
    };
    const { token } = await call("POST", "/auth/login/admin", {
      username: "owner",
      password: "owner-pass",
    });
    const rows = ["name,category,price_lbp,available"];
    for (let i = 0; i < 600; i++) rows.push(`منتج ${i},تصنيف ${i % 20},${(i + 1) * 1000},yes`);
    const upload = {
      filename: "big.csv",
      content: btoa(unescape(encodeURIComponent(rows.join("\n")))),
    };
    const preview = await call("POST", "/menu/import/preview", upload, token);
    await call(
      "POST",
      "/menu/import/apply",
      { ...upload, mode: "add", menu_version: preview.menu_version },
      token,
    );
    await call("POST", "/auth/logout", { password: "owner-pass" }, token);
  });
  await page.reload();

  await page.getByRole("button", { name: "كاشير" }).click();
  await page.getByRole("radio", { name: "سارة" }).click();
  await page.getByLabel("كلمة المرور").fill("1234");
  await button(page, "دخول").click();
  await button(page, "بدء الوردية").click();
  const shown = Date.now();
  await page.locator(".tile").first().waitFor();
  const menuShown = Date.now() - shown;
  const tiles = await page.locator(".tile").count();

  const taps: number[] = [];
  for (let i = 0; i < 12; i++) {
    const start = performance.now();
    await page
      .locator(".tile")
      .nth(i * 40)
      .click();
    await expect(page.locator(".item")).toHaveCount(i + 1 > 12 ? 12 : i + 1);
    taps.push(Math.round(performance.now() - start));
  }
  await expect(page.locator(".total")).toContainText("ل.ل");
  const search = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[placeholder="ابحث عن منتج"]')!;
    const start = performance.now();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, "منتج 59");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - start);
  });
  const memory = memoryMb(app.process().pid!);
  console.log(`  processes: ${breakdown(app.process().pid!)}`);
  const sorted = [...taps].sort((a, b) => a - b);
  console.log(
    `\n  start-up to first screen: ${startup} ms\n  menu of ${tiles} products shown: ${menuShown} ms` +
      `\n  tap to total updated: median ${sorted[6]} ms, worst ${sorted.at(-1)} ms` +
      `\n  search in ${tiles} products: ${search} ms\n  memory, app and backend together: ${memory} MB`,
  );
  expect(startup).toBeLessThan(10_000);
  expect(menuShown).toBeLessThan(2_000);
  expect(sorted[6]).toBeLessThan(500);
  expect(search).toBeLessThan(500);
  expect(memory).toBeLessThan(900);
  await app.close();
});
