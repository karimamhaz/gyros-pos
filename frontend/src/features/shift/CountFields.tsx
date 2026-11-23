import { useI18n } from "../../i18n";
import { formatNumber, parseInteger } from "../../shared/format";
import type { CountMode } from "../../shared/types";
import { AmountField, Field, Lbp, Ltr, Usd } from "../../shared/ui";

export interface Count {
  usd_cents: number;
  lbp: number;
  notes: { usd: Record<string, number>; lbp: Record<string, number> } | null;
}

export const emptyCount = (mode: CountMode): Count => ({
  usd_cents: 0,
  lbp: 0,
  notes: mode === "banknotes" ? { usd: {}, lbp: {} } : null,
});

const USD = ["100", "50", "20", "10", "5", "2", "1"];
const LBP = ["1000000", "500000", "100000", "50000", "20000", "10000", "5000", "1000"];
const sum = (notes: Record<string, number>) =>
  Object.entries(notes).reduce((total, [note, n]) => total + Number(note) * n, 0);

export function CountFields({
  value,
  onChange,
}: {
  value: Count;
  onChange: (count: Count) => void;
}) {
  const { t } = useI18n();
  const { notes } = value;
  if (!notes) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <AmountField
          label={t("count.usd")}
          currency="USD"
          value={value.usd_cents}
          onChange={(usd_cents) => onChange({ ...value, usd_cents })}
        />
        <AmountField
          label={t("count.lbp")}
          currency="LBP"
          value={value.lbp}
          onChange={(lbp) => onChange({ ...value, lbp })}
        />
      </div>
    );
  }
  const column = (currency: "usd" | "lbp", list: string[]) => (
    <div className="grid gap-1.5 content-start">
      {list.map((note) => (
        <div className="note-row" key={note}>
          <Field
            label={<Ltr>{(currency === "usd" ? "$" : "") + formatNumber(Number(note))}</Ltr>}
            kind="digits"
            value={String(notes[currency][note] || "")}
            onChange={(text) =>
              onChange({
                ...value,
                notes: {
                  ...notes,
                  [currency]: { ...notes[currency], [note]: Math.min(parseInteger(text), 100000) },
                },
              })
            }
          />
        </div>
      ))}
      <b>
        {currency === "usd" ? <Usd cents={sum(notes.usd) * 100} /> : <Lbp value={sum(notes.lbp)} />}
      </b>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-5">
      {column("usd", USD)}
      {column("lbp", LBP)}
    </div>
  );
}
