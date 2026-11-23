import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { saveFile } from "../../shared/bridge";
import { formatDate } from "../../shared/format";
import {
  AmountField,
  Button,
  Empty,
  ErrorNote,
  Field,
  Lbp,
  Segmented,
  Table,
  Tag,
  Usd,
  Ltr,
  useAction,
  useLoad,
} from "../../shared/ui";
import { DateField } from "./DateField";
import { Head } from "./Head";

type Kind = "expense" | "cost";
type Currency = "LBP" | "USD";
interface Entry {
  id: string;
  kind: Kind;
  category: string;
  description: string;
  currency: Currency;
  amount: number;
  value_lbp: number;
  day: string;
}
interface Data {
  entries: Entry[];
  total: number;
  categories: string[];
  /** The business day, which can be yesterday's date after midnight. */
  today: string;
}
const localDay = (back = 0) => {
  const d = new Date(Date.now() - back * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function ExpensesPage() {
  const { t } = useI18n();
  const [start, setStart] = useState(() => localDay(30));
  const [end, setEnd] = useState(() => localDay());
  const [deleting, setDeleting] = useState<string | null>(null);
  const query = new URLSearchParams();
  if (start) query.set("start", start);
  if (end) query.set("end", end);
  const key = query.toString();
  const data = useLoad(() => api.get<Data>(`/expenses?${key}`), key);
  const { busy, error, run } = useAction();

  return (
    <>
      <Head title={t("admin.expenses")}>
        <div className="flex gap-2 items-end">
          <DateField label={t("from")} value={start} onChange={setStart} />
          <DateField label={t("to")} value={end} onChange={setEnd} />
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => saveFile(await api.blob(`/expenses/export?${key}`), "expenses.xlsx"))
            }
          >
            {t("export.excel")}
          </Button>
        </div>
      </Head>
      <ErrorNote error={error ?? data.error} />
      <div className="flex gap-4 min-h-0 flex-1 items-start">
        <div className="flex-1 grid gap-3 min-h-0 max-h-full">
          {data.data?.entries.length === 0 && <Empty>{t("expenses.none")}</Empty>}
          {!!data.data?.entries.length && (
            <Table head={[t("day"), t("type"), t("category"), t("expenses.note"), t("amount"), ""]}>
              {data.data.entries.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Ltr>{formatDate(e.day)}</Ltr>
                  </td>
                  <td>
                    <Tag>{t(`expenses.${e.kind}`)}</Tag>
                  </td>
                  <td>
                    <bdi>{e.category}</bdi>
                  </td>
                  <td>
                    <bdi>{e.description}</bdi>
                  </td>
                  <td>
                    <b>
                      {e.currency === "USD" ? <Usd cents={e.amount} /> : <Lbp value={e.amount} />}
                    </b>
                  </td>
                  <td>
                    <Button
                      size="s"
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        if (deleting !== e.id) return setDeleting(e.id);
                        void run(async () => {
                          await api.delete(`/expenses/${e.id}`);
                          setDeleting(null);
                          await data.reload();
                        });
                      }}
                    >
                      {t(deleting === e.id ? "delete.confirm" : "remove")}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {data.data && (
            <div className="box p-3.5 line">
              <b>{t("expenses.total")}</b>
              <b>
                <Lbp value={data.data.total} />
              </b>
            </div>
          )}
          <p className="soft">{t("expenses.rules")}</p>
        </div>
        {data.data && (
          <NewEntry
            key={data.data.today}
            today={data.data.today}
            categories={data.data.categories}
            onSaved={data.reload}
          />
        )}
      </div>
    </>
  );
}

function NewEntry({
  today,
  categories,
  onSaved,
}: {
  today: string;
  categories: string[];
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>("expense");
  const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState<Currency>("LBP");
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [day, setDay] = useState(today);
  const { busy, error, run } = useAction();
  return (
    <div className="box p-5 grid gap-3 content-start w-[340px] flex-none scroll max-h-full">
      <h2>{t("expenses.new")}</h2>
      <Segmented<Kind>
        options={[
          ["expense", t("expenses.expense")],
          ["cost", t("expenses.cost")],
        ]}
        value={kind}
        onChange={setKind}
      />
      <Field label={t("category")} value={category} onChange={setCategory} maxLength={40} />
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {categories.slice(0, 6).map((c) => (
            <Button
              size="s"
              key={c}
              variant={c === category ? "dark" : "plain"}
              onClick={() => setCategory(c)}
            >
              <bdi>{c}</bdi>
            </Button>
          ))}
        </div>
      )}
      <Segmented<Currency>
        options={[
          ["LBP", t("lbp")],
          ["USD", "USD"],
        ]}
        value={currency}
        onChange={(c) => {
          setCurrency(c);
          setAmount(0);
        }}
      />
      <AmountField
        key={currency}
        label={t("amount")}
        currency={currency}
        value={amount}
        onChange={setAmount}
      />
      <Field
        label={t("expenses.note")}
        value={description}
        onChange={setDescription}
        maxLength={160}
      />
      <DateField label={t("day")} value={day} onChange={setDay} />
      <ErrorNote error={error} />
      <Button
        variant="dark"
        disabled={busy || !category.trim() || !amount || !day}
        onClick={() =>
          run(async () => {
            await api.post("/expenses", { kind, category, currency, amount, description, day });
            setAmount(0);
            setDescription("");
            await onSaved();
          })
        }
      >
        {t("save")}
      </Button>
    </div>
  );
}
