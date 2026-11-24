import type { Page } from "@playwright/test";

/**
 * Measures the page like a person looking at it. Returns plain sentences for anything that is
 * too close to an edge, out of line with its neighbours, overlapping or hidden by the keyboard.
 */
export function audit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const MARGIN = 10;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none";
    };
    const name = (el: Element) => {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
      const input = el.querySelector("input,textarea,select");
      return `${el.className.toString().split(" ")[0] || el.tagName.toLowerCase()} "${text || input?.getAttribute("aria-label") || ""}"`;
    };
    // Only the topmost layer is judged: a dialog hides the page behind it.
    const layer = [...document.querySelectorAll(".overlay")].at(-1) ?? document.body;
    const inLayer = (el: Element) => layer.contains(el);
    const rect = (el: Element) => el.getBoundingClientRect();
    const kb = document.querySelector('[data-testid="keyboard"]');
    const top = kb ? rect(kb).top : innerHeight;

    // 1. Nothing is wider than the window, and nothing is clipped by it.
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push("page scrolls sideways");

    const controls = [
      ...layer.querySelectorAll<HTMLElement>(".input, .btn, .seg, .pick, .tag, .check, h1, h2"),
    ].filter(
      (el) =>
        visible(el) &&
        !el.closest(".kb, .pad, .side, .topbar, table, .tile, .item, .picker, .preview, .qty"),
    );

    // 1b. Nothing is cut off by the box that holds it, and no box scrolls sideways.
    for (const el of layer.querySelectorAll<HTMLElement>("*")) {
      const s = getComputedStyle(el);
      if (!visible(el) || el.closest(".kb, .preview, .trend")) continue;
      if (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        out.push(`${name(el)} scrolls sideways`);
      }
    }
    for (const el of controls) {
      const r = rect(el);
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
        const s = getComputedStyle(up);
        if (s.overflowX === "visible") continue;
        const b = rect(up);
        if (r.left < b.left - 1 || r.right > b.right + 1) {
          out.push(`${name(el)} is cut off by ${name(up)}`);
          break;
        }
      }
    }

    // 2. Margin: controls keep their distance from the edge of the box they sit in.
    for (const el of controls) {
      const box = el.parentElement?.closest<HTMLElement>(
        ".card, .dialog, .box, .ticket, .page, .work, .ticket-foot, .ticket-head",
      );
      if (!box) continue;
      const b = rect(box);
      const r = rect(el);
      const full = box.classList.contains("page") || box.classList.contains("work");
      const gaps = [r.left - b.left, b.right - r.right];
      const clipped = box.scrollWidth > box.clientWidth + 1;
      if (!clipped && Math.min(...gaps) < (full ? 8 : MARGIN)) {
        out.push(`${name(el)} is ${Math.round(Math.min(...gaps))}px from the edge of ${name(box)}`);
      }
    }

    // 3. Fields: label and input line up, and fields in one row share one baseline.
    const fields = [...layer.querySelectorAll<HTMLElement>("label.label")]
      .filter(visible)
      .map((label) => ({
        label,
        input: label.parentElement?.querySelector<HTMLElement>(".input"),
      }));
    for (const { label, input } of fields) {
      if (!input) continue;
      const l = rect(label);
      const i = rect(input);
      const start =
        document.dir === "rtl" ? Math.abs(l.right - i.right) : Math.abs(l.left - i.left);
      if (start > 1.5)
        out.push(`label "${label.textContent}" is ${Math.round(start)}px off its field`);
      const gap = i.top - l.bottom;
      if (gap < 2 || gap > 9)
        out.push(`label "${label.textContent}" is ${Math.round(gap)}px above its field`);
    }
    const rows = new Map<Element, typeof fields>();
    for (const f of fields) {
      const key = f.label.parentElement?.parentElement;
      if (key) rows.set(key, [...(rows.get(key) ?? []), f]);
    }
    for (const group of rows.values()) {
      const wrappers = group.map((f) => f.label.parentElement!);
      const sameRow = (a: HTMLElement, b: HTMLElement) => Math.abs(rect(a).top - rect(b).top) < 4;
      for (const [index, a] of group.entries()) {
        for (const b of group.slice(index + 1)) {
          if (!a.input || !b.input || !sameRow(wrappers[index], b.label.parentElement!)) continue;
          if (Math.abs(rect(a.input).top - rect(b.input).top) > 1.5) {
            out.push(
              `fields "${a.label.textContent}" and "${b.label.textContent}" start at different heights`,
            );
          }
          if (Math.abs(rect(a.input).height - rect(b.input).height) > 1.5) {
            out.push(
              `fields "${a.label.textContent}" and "${b.label.textContent}" differ in height`,
            );
          }
        }
      }
    }

    // 4. Buttons side by side are equally tall.
    for (const row of layer.querySelectorAll<HTMLElement>(".flex, .line")) {
      const buttons = [...row.children].filter(
        (c) => c.classList.contains("btn") && visible(c),
      ) as HTMLElement[];
      if (buttons.length < 2) continue;
      const heights = buttons.map((b) => Math.round(rect(b).height));
      if (Math.max(...heights) - Math.min(...heights) > 1) {
        out.push(
          `buttons ${buttons.map((b) => `"${b.textContent}"`).join(", ")} have heights ${heights.join("/")}`,
        );
      }
    }

    // 4b. A product's count badge never sits on its name or price.
    for (const tile of layer.querySelectorAll<HTMLElement>(".tile")) {
      const badge = tile.querySelector("i");
      if (!badge) continue;
      for (const other of tile.querySelectorAll<HTMLElement>("bdi, .price, .stock")) {
        const p = rect(badge);
        const range = document.createRange();
        range.selectNodeContents(other);
        const q = range.getBoundingClientRect(); // the words themselves, not their box
        const AIR = 6; // a little room, so it never looks squeezed
        const w = Math.min(p.right + AIR, q.right) - Math.max(p.left - AIR, q.left);
        const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        if (w > 1 && h > 1) out.push(`count badge is too close to "${other.textContent}"`);
      }
    }

    // 5. Nothing important overlaps, and nothing sits under the keyboard.
    const hit = [...layer.querySelectorAll<HTMLElement>(".input, .btn, .seg")].filter(
      (el) => visible(el) && !el.closest(".kb, .pad, table, .scroll, .picker, .tile, .item"),
    );
    for (const [index, a] of hit.entries()) {
      for (const b of hit.slice(index + 1)) {
        if (a.contains(b) || b.contains(a)) continue;
        const p = rect(a);
        const q = rect(b);
        const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
        const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        if (w > 2 && h > 2) out.push(`${name(a)} overlaps ${name(b)}`);
      }
    }
    if (kb) {
      const focus = document.activeElement as HTMLElement | null;
      if (focus && focus.matches("input,textarea")) {
        const r = rect(focus);
        if (r.bottom > top + 1 || r.top < 0)
          out.push(`the field being typed in is hidden by the keyboard`);
      }
    }
    return [...new Set(out)];
  });
}
