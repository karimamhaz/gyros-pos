import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type ReactNode,
} from "react";
import { useI18n } from "../i18n";
import { formatNumber, formatUsd, parseAmount } from "./format";
import type { KeyboardKind } from "./keyboard";

type Variant = "primary" | "dark" | "plain" | "danger";
type Size = "s" | "m" | "l";

export function Button({
  variant = "plain",
  size = "m",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={`btn ${variant} size-${size} ${className}`} {...rest} />;
}

/** Text that must read left to right inside Arabic. */
export const Ltr = ({ children }: { children: ReactNode }) => (
  <bdi className="num" dir="ltr">
    {children}
  </bdi>
);

export function Lbp({ value }: { value: number }) {
  const { t } = useI18n();
  return (
    <span className="nowrap">
      <Ltr>{formatNumber(value)}</Ltr> <small>{t("lbp")}</small>
    </span>
  );
}

export const Usd = ({ cents }: { cents: number }) => <Ltr>{formatUsd(cents)}</Ltr>;

export const Tag = ({
  tone = "",
  children,
}: {
  tone?: "" | "good" | "bad" | "warn";
  children: ReactNode;
}) => <span className={`tag ${tone}`}>{children}</span>;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="seg" role="group" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            type="button"
            key={key}
            className={key === value ? "on" : ""}
            aria-pressed={key === value}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  kind?: KeyboardKind;
  password?: boolean;
  unit?: ReactNode;
  autoFocus?: boolean;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  suggestions?: string[];
  disabled?: boolean;
  dir?: "ltr" | "rtl" | "auto";
  onEnter?: () => void;
  onFocus?: () => void;
  /** Selects the whole text when the field is tapped, so typing replaces it. */
  selectAll?: boolean;
}

export function Field({
  label,
  value,
  onChange,
  kind = "text",
  password,
  unit,
  multiline,
  suggestions,
  onEnter,
  dir,
  selectAll,
  onFocus,
  ...rest
}: FieldProps) {
  const { t } = useI18n();
  const id = useId();
  const [shown, setShown] = useState(false);
  const common = {
    id,
    value,
    "data-kb": kind,
    // An empty field follows the page, so its placeholder sits on the right side.
    dir: dir ?? (kind !== "text" ? ("ltr" as const) : value ? ("auto" as const) : undefined),
    autoComplete: "off",
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (selectAll) e.currentTarget.select();
      onFocus?.();
    },
    ...rest,
  };
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className={`input ${multiline ? "tall" : ""}`}>
        {multiline ? (
          <textarea {...common} />
        ) : (
          <input
            {...common}
            type={password && !shown ? "password" : "text"}
            list={suggestions ? `${id}-list` : undefined}
            onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          />
        )}
        {password && (
          <button type="button" className="link" tabIndex={-1} onClick={() => setShown(!shown)}>
            {shown ? t("hide") : t("show")}
          </button>
        )}
        {unit && <b>{unit}</b>}
        {suggestions && (
          <datalist id={`${id}-list`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}

/** Whole LBP, or USD held as cents. Shows separators while typing. */
export function AmountField({
  currency,
  value,
  onChange,
  ...rest
}: Omit<FieldProps, "value" | "onChange" | "kind" | "unit"> & {
  currency: "LBP" | "USD";
  value: number;
  onChange: (value: number) => void;
  kind?: KeyboardKind;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<{ text: string; value: number } | null>(null);
  const shown = draft && draft.value === value ? draft.text : amountText(currency, value);
  return (
    <Field
      kind={currency === "USD" ? "decimal" : "digits"}
      selectAll
      {...rest}
      value={shown}
      unit={currency === "USD" ? "USD" : t("lbp")}
      maxLength={16}
      onChange={(text) => {
        const parsed = parseAmount(currency, text);
        if (!parsed) return;
        setDraft(parsed);
        onChange(parsed.value);
      }}
    />
  );
}

const amountText = (currency: "LBP" | "USD", value: number) =>
  value === 0 ? "" : currency === "USD" ? formatUsd(value).slice(1) : formatNumber(value);

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="input">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="box scroll">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="box empty">{children}</div>
);

export const Line = ({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`line ${className}`}>
    <span>{label}</span>
    <span>{children}</span>
  </div>
);

export function ErrorNote({ error }: { error: unknown }) {
  const { errorText } = useI18n();
  return error ? (
    <div className="error-note" role="alert">
      {errorText(error)}
    </div>
  ) : null;
}

export function Dialog({
  title,
  children,
  onClose,
  wide,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close.current?.();
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus?.();
    };
  }, []);
  return (
    <div className="overlay">
      <div
        className={`dialog ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={box}
      >
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Runs one action at a time and keeps its error for display. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const running = useRef(false);
  const run = useCallback(async (work: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clear: useCallback(() => setError(null), []) };
}

export function useLoad<T>(load: () => Promise<T>, key = "") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const latest = useRef(load);
  const turn = useRef(0);
  useEffect(() => {
    latest.current = load;
  });
  const reload = useCallback(async () => {
    const mine = ++turn.current;
    try {
      const value = await latest.current();
      if (mine === turn.current) {
        setData(value);
        setError(null);
      }
    } catch (e) {
      if (mine === turn.current) setError(e);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload, key]);
  return { data, error, reload, setData };
}
