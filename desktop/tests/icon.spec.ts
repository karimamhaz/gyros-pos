import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const packaging = path.resolve(__dirname, "../packaging");

test("the app icon is a proper Windows icon and a square picture", () => {
  const ico = readFileSync(path.join(packaging, "icon.ico"));
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]); // an icon file
  const count = ico.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256);
  expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 256])); // taskbar, list, large
  const png = readFileSync(path.join(packaging, "icon.png"));
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([512, 512]);
});

test("the installer and the Windows app both use that icon", () => {
  const config = readFileSync(path.resolve(__dirname, "../electron-builder.yml"), "utf8");
  expect(config.match(/packaging\/icon\.ico/g)).toHaveLength(4); // app, installer, uninstaller, header
});
