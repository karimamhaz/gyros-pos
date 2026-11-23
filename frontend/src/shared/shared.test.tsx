import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import ar from "../i18n/ar.json";
import en from "../i18n/en.json";
import { I18nProvider, useI18n } from "../i18n";
import { formatNumber, formatUsd, parseAmount } from "./format";
import { OnScreenKeyboard, type KeyboardKind } from "./keyboard";
import { AmountField, Field } from "./ui";

afterEach(cleanup);

describe("languages", () => {
  test("have the same keys and placeholders", () => {
    expect(Object.keys(ar)).toEqual(Object.keys(en));
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(holes(ar[key]), key).toEqual(holes(en[key]));
    }
  });

  test("set the page direction", () => {
    function Switch() {
      const { setLang } = useI18n();
      return <button onClick={() => setLang("en")}>switch</button>;
    }
    render(
      <I18nProvider>
        <Switch />
      </I18nProvider>,
    );
    expect(document.documentElement.dir).toBe("rtl");
    fireEvent.click(screen.getByText("switch"));
    expect(document.documentElement.dir).toBe("ltr");
  });
});

describe("amounts", () => {
  test("format", () => {
    expect(formatNumber(1650000)).toBe("1,650,000");
    expect(formatUsd(1844)).toBe("$18.44");
    expect(formatUsd(5)).toBe("$0.05");
  });
  test("parse", () => {
    expect(parseAmount("LBP", "1,650,000")).toEqual({ text: "1,650,000", value: 1650000 });
    expect(parseAmount("LBP", "١٢٣")?.value).toBe(123);
    expect(parseAmount("LBP", "1.5")).toBeNull();
    expect(parseAmount("USD", "10.")).toEqual({ text: "10.", value: 1000 });
    expect(parseAmount("USD", "18.44")?.value).toBe(1844);
    expect(parseAmount("USD", "1.234")).toBeNull();
    expect(parseAmount("USD", "-1")).toBeNull();
  });
});

function Form({ kind, lang = "en" }: { kind: KeyboardKind; lang?: "ar" | "en" }) {
  const [text, setText] = useState("");
  return (
    <I18nProvider initial={lang}>
      <Field label="field" kind={kind} value={text} onChange={setText} />
      <OnScreenKeyboard />
    </I18nProvider>
  );
}
const focus = () => act(() => screen.getByLabelText<HTMLInputElement>("field").focus());
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const value = () => screen.getByLabelText<HTMLInputElement>("field").value;

describe("on-screen keyboard", () => {
  test("shows numbers for number fields and types them", () => {
    render(<Form kind="digits" />);
    expect(screen.queryByTestId("keyboard")).toBeNull();
    focus();
    press("4");
    press("2");
    press("Delete");
    expect(value()).toBe("4");
    expect(screen.queryByRole("button", { name: "q" })).toBeNull();
  });

  test("shows letters in the app language", () => {
    render(<Form kind="text" lang="ar" />);
    focus();
    press("ش");
    press("English");
    press("⇧");
    press("A");
    press("b");
    expect(value()).toBe("شAb");
  });

  test("opens in English for codes and passwords", () => {
    render(<Form kind="latin" lang="ar" />);
    focus();
    press("q");
    expect(value()).toBe("q");
  });

  test("stays away when the field has its own keypad or a real key is used", () => {
    render(<Form kind="none" />);
    focus();
    expect(screen.queryByTestId("keyboard")).toBeNull();
  });

  test("types money with separators", () => {
    function Money() {
      const [v, setV] = useState(0);
      return (
        <I18nProvider initial="en">
          <AmountField label="field" currency="LBP" value={v} onChange={setV} />
          <OnScreenKeyboard />
        </I18nProvider>
      );
    }
    render(<Money />);
    focus();
    press("4");
    press("5");
    press("000");
    expect(value()).toBe("45,000");
    press("Delete");
    expect(value()).toBe("4,500");
  });
});
