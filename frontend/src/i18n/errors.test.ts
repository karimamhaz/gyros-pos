// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import en from "./en.json";

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".py") ? [join(dir, e.name)] : [],
  );

test("every backend error has a message", () => {
  const codes = new Set<string>();
  for (const file of files(join(import.meta.dirname, "../../../backend/app"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/AppError\(\s*"(\w+)"/g)) codes.add(m[1]);
  }
  expect(codes.size).toBeGreaterThan(40);
  expect([...codes].filter((c) => !(`error.${c}` in en))).toEqual([]);
});
