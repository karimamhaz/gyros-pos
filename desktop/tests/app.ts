import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, type Page } from "@playwright/test";

export const dataDir = () => mkdtempSync(path.join(tmpdir(), "pos-"));

export const launch = (dir = dataDir()) =>
  electron.launch({
    args: [path.resolve(__dirname, ".."), `--user-data-dir=${dir}`],
    env: {
      ...(process.env as Record<string, string>),
      POS_DATA_DIR: path.join(dir, "Data"),
      POS_BACKUP_DIR: path.join(dir, "Backups"),
    },
  });

export const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** Screenshots for comparing with the approved design, only when SHOTS is set. */
let shot = 0;
export async function snap(page: Page, name: string) {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(250);
  const file = `${String(++shot).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: path.join(process.env.SHOTS, file) });
}

/** The whole page must fit, whatever is on it. */
export async function fits(page: Page) {
  const over = await page.evaluate(() => {
    const root = document.documentElement;
    const outside = [
      ...document.querySelectorAll<HTMLElement>("button, .tag, .num, h1, h2, label"),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || el.closest(".scroll, .admin-page, .picker, .side, .kb, .overlay")) {
        return false;
      }
      return r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1;
    });
    return { x: root.scrollWidth > innerWidth, outside: outside.map((el) => el.textContent) };
  });
  expect(over).toEqual({ x: false, outside: [] });
}
