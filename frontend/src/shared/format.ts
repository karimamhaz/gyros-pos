const grouped = new Intl.NumberFormat("en-US");

/** Western digits in both languages, as on the printed menu. */
export const formatNumber = (value: number) => grouped.format(value).replace("-", "−");

export const formatUsd = (cents: number) => {
  const size = Math.abs(cents);
  const whole = grouped.format(Math.floor(size / 100));
  return `${cents < 0 ? "−" : ""}$${whole}.${String(size % 100).padStart(2, "0")}`;
};

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const latinDigits = (text: string) =>
  text.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf));

/** Null when the text is not an amount, so the keystroke is ignored. */
export function parseAmount(
  currency: "LBP" | "USD",
  text: string,
): { text: string; value: number } | null {
  const clean = latinDigits(text).replace(/[,\s]/g, "").replace("٫", ".");
  if (clean === "") return { text: "", value: 0 };
  if (currency === "LBP") {
    if (!/^\d{1,12}$/.test(clean)) return null;
    const value = Number(clean);
    return { text: formatNumber(value), value };
  }
  const match = /^(\d{0,9})(?:\.(\d{0,2}))?$/.exec(clean);
  if (!match) return null;
  const value = Number(match[1] || 0) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return { text: clean, value };
}

export const parseInteger = (text: string) => {
  const clean = latinDigits(text).replace(/\D/g, "").slice(0, 9);
  return clean === "" ? 0 : Number(clean);
};

const two = (n: number) => String(n).padStart(2, "0");

export const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours() % 12 || 12}:${two(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
};

export const formatDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${formatTime(iso)}`;
};
