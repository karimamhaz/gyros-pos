import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";

const dataDir = () => mkdtempSync(path.join(tmpdir(), "pos-"));
const launch = (dir = dataDir()) =>
  electron.launch({
    args: [path.resolve(__dirname, ".."), `--user-data-dir=${dir}`],
    env: {
      ...(process.env as Record<string, string>),
      POS_DATA_DIR: path.join(dir, "Data"),
      POS_BACKUP_DIR: path.join(dir, "Backups"),
    },
  });
const backends = (app: ElectronApplication) =>
  execSync(`pgrep -P ${app.process().pid} -f app.main || true`).toString().trim();

test("opens, talks to the backend and leaves nothing running", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect
    .poll(() => page.evaluate(() => fetch("/api/health").then((r) => r.status)))
    .toBe(200);
  const pid = app.process().pid!;
  await app.close();
  await expect.poll(() => execSync(`pgrep -P ${pid} || true`).toString()).toBe("");
});

test("the page has no Node access and cannot leave the app", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  expect(
    await page.evaluate(() => [typeof (window as any).require, typeof (window as any).process]),
  ).toEqual(["undefined", "undefined"]);
  await page.evaluate(() => void (location.href = "https://example.com"));
  await page.waitForTimeout(500);
  expect(page.url()).toBe("app://pos/");
  expect(await page.evaluate(() => fetch("https://example.com").catch(() => "blocked"))).toBe(
    "blocked",
  );
  expect(await page.evaluate(() => fetch("/../../package.json").then((r) => r.status))).toBe(404);
  expect(
    await page.evaluate(() => fetch("/%2e%2e%2f%2e%2e%2fpackage.json").then((r) => r.status)),
  ).toBe(404);
  await app.close();
});

test("restarts a crashed backend, then gives up clearly", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  const healthy = () =>
    expect
      .poll(() => page.evaluate(() => fetch("/api/health").then((r) => r.status)), {
        timeout: 15_000,
      })
      .toBe(200);
  await healthy();
  for (let i = 0; i < 3; i++) {
    execSync(`kill -9 ${backends(app).split("\n").join(" ")}`);
    await page.waitForTimeout(300);
    await healthy();
  }
  execSync(`kill -9 ${backends(app).split("\n").join(" ")}`);
  await expect(page.getByText("could not restart")).toBeVisible();
  await app.close();
});

test("a second launch does not open a second app", async () => {
  const dir = dataDir();
  const app = await launch(dir);
  await app.firstWindow();
  const second = await launch(dir).catch(() => null);
  if (second)
    await expect.poll(() => second.process().exitCode, { timeout: 10_000 }).not.toBeNull();
  expect(app.windows()).toHaveLength(1);
  await app.close();
});

test("a missing printer is reported, not thrown", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  const print = (o: object) =>
    page.evaluate((options) => (window as any).pos.print("<p>شاورما</p>", options), o);
  expect(await print({ widthMm: 80 })).toEqual({ ok: false, error: "no_printer" });
  expect(await print({ widthMm: 80, printer: "does-not-exist" })).toEqual({
    ok: false,
    error: "printer_missing",
  });
  await app.close();
});
