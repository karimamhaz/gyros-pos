import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useI18n, type Lang } from "../i18n";

/** How a field wants to be typed into. `none` fields bring their own keypad. */
export type KeyboardKind = "text" | "latin" | "digits" | "decimal" | "none";
type Field = HTMLInputElement | HTMLTextAreaElement;
type Layout = Lang | "symbols";

const ROWS: Record<Layout, string[][]> = {
  ar: [[..."1234567890"], [..."ضصثقفغعهخحجد"], [..."شسيبلاتنمكط"], [..."ئءؤرىةوزظذ"], [..."أإآـ،"]],
  en: [[..."1234567890"], [..."qwertyuiop"], [..."asdfghjkl"], [..."zxcvbnm"]],
  symbols: [[..."1234567890"], [..."-_.,/:;@#&"], [..."()%+=*!?'\""]],
};

const keyboardKind = (el: Element | null): KeyboardKind | null =>
  (el?.getAttribute("data-kb") as KeyboardKind | null) ?? null;

/** Types into a field the way a person would, so React sees a normal change. */
export function typeInto(field: Field, text: string | "backspace") {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const erase = text === "backspace";
  const from = erase && start === end ? Math.max(0, start - 1) : start;
  const value = field.value.slice(0, from) + (erase ? "" : text) + field.value.slice(end);
  if (!erase && field.maxLength > 0 && value.length > field.maxLength) return;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(prototype.prototype, "value")!.set!.call(field, value);
  const caret = from + (erase ? 0 : text.length);
  field.setSelectionRange(caret, caret);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Pressing a key must not take focus away from the field. */
const keepFocus = (e: PointerEvent) => e.preventDefault();

export function NumberPad({
  decimal,
  both,
  onKey,
}: {
  decimal: boolean;
  /** One pad for both currencies: a point and 000. */
  both?: boolean;
  onKey: (key: string | "backspace") => void;
}) {
  const { t } = useI18n();
  const key = (k: string) => (
    <button type="button" tabIndex={-1} key={k} onClick={() => onKey(k)}>
      {k}
    </button>
  );
  return (
    <div className="pad" dir="ltr" onPointerDown={keepFocus} onMouseDown={keepFocusMouse}>
      {[..."123456789"].map(key)}
      {key(decimal || both ? "." : "000")}
      {key("0")}
      {both && key("000")}
      <button
        type="button"
        tabIndex={-1}
        className={both ? "word full" : "word"}
        onClick={() => onKey("backspace")}
      >
        {t("kb.delete")}
      </button>
    </div>
  );
}
const keepFocusMouse = (e: { preventDefault(): void }) => e.preventDefault();

export function OnScreenKeyboard() {
  const { lang, t } = useI18n();
  const [field, setField] = useState<Field | null>(null);
  const [layout, setLayout] = useState<Layout>(lang);
  const [shift, setShift] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const kind = keyboardKind(field);

  useEffect(() => {
    // While a finger or mouse is down the page must not move, or the press would miss its button.
    let pressing = false;
    let wanted: Field | null = null;
    const show = (next: Field | null) => {
      wanted = next;
      if (!pressing) setField(next);
    };
    const down = () => {
      pressing = true;
    };
    const up = () => {
      if (!pressing) return;
      pressing = false;
      setTimeout(() => !pressing && setField(wanted), 0); // after the click itself
    };
    const open = (e: Event) => {
      const el = e.target as Field;
      const k = keyboardKind(el);
      if (!k || k === "none" || el.readOnly || el.disabled) return show(null);
      setShift(false);
      setLayout(k === "latin" ? "en" : lang);
      show(el);
    };
    const reopen = (e: Event) => {
      if (e.target === document.activeElement && keyboardKind(e.target as Element)) open(e);
    };
    const close = () => show(null);
    const physical = (e: KeyboardEvent) => {
      // Someone typing on real keys does not need the panel.
      if (e.isTrusted && e.key !== "Tab") show(null);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("focusin", open);
    document.addEventListener("focusout", close);
    document.addEventListener("click", reopen);
    document.addEventListener("keydown", physical);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("focusin", open);
      document.removeEventListener("focusout", close);
      document.removeEventListener("click", reopen);
      document.removeEventListener("keydown", physical);
    };
  }, [lang]);

  // Room for the panel, so the field being typed into is never covered.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--kb", field ? `${panel.current?.offsetHeight ?? 0}px` : "0px");
    if (field) requestAnimationFrame(() => field.scrollIntoView?.({ block: "center" }));
  }, [field, layout]);

  // A dialog that closes takes its field with it, without a blur event.
  useEffect(() => {
    if (!field) return;
    const watch = new MutationObserver(() => !field.isConnected && setField(null));
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [field]);

  if (!field || !kind) return null;

  const press = (key: string | "backspace") => {
    typeInto(field, key);
    setShift(false);
  };
  const numeric = kind === "digits" || kind === "decimal";
  const keyStyle: CSSProperties = { flex: 1 };

  return (
    <div
      ref={panel}
      className={`kb ${numeric ? "kb-num" : ""}`}
      data-testid="keyboard"
      dir="ltr"
      onPointerDown={keepFocus}
      onMouseDown={keepFocusMouse}
    >
      {numeric ? (
        <>
          <NumberPad decimal={kind === "decimal"} onKey={press} />
          <button type="button" tabIndex={-1} className="kb-done" onClick={() => field.blur()}>
            {t("kb.done")}
          </button>
        </>
      ) : (
        <>
          {ROWS[layout].map((row, i) => (
            <div className="kb-row" key={i}>
              {layout === "en" && i === 3 && (
                <button
                  type="button"
                  tabIndex={-1}
                  className={shift ? "on" : "dim"}
                  aria-pressed={shift}
                  onClick={() => setShift(!shift)}
                >
                  ⇧
                </button>
              )}
              {row.map((k) => {
                const key = shift && layout === "en" ? k.toUpperCase() : k;
                return (
                  <button
                    type="button"
                    tabIndex={-1}
                    key={k}
                    style={keyStyle}
                    onClick={() => press(key)}
                  >
                    {key}
                  </button>
                );
              })}
              {i === ROWS[layout].length - 1 && (
                <button
                  type="button"
                  tabIndex={-1}
                  className="dim wide"
                  onClick={() => press("backspace")}
                >
                  {t("kb.delete")}
                </button>
              )}
            </div>
          ))}
          <div className="kb-row">
            <button
              type="button"
              tabIndex={-1}
              className="dim wide"
              onClick={() => setLayout(layout === "symbols" ? lang : "symbols")}
            >
              {layout === "symbols" ? (lang === "ar" ? "أ ب" : "ABC") : "#+="}
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="dim wide"
              onClick={() => setLayout(layout === "ar" ? "en" : "ar")}
            >
              {layout === "ar" ? "English" : "العربية"}
            </button>
            <button type="button" tabIndex={-1} style={{ flex: 5 }} onClick={() => press(" ")}>
              {t("kb.space")}
            </button>
            <button type="button" tabIndex={-1} className="kb-done" onClick={() => field.blur()}>
              {t("kb.done")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
