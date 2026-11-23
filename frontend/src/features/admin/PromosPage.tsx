import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { formatDate, parseInteger } from "../../shared/format";
import {
  Button,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  Ltr,
  Segmented,
  Table,
  Tag,
  useAction,
  useLoad,
} from "../../shared/ui";
import { DateField } from "./DateField";
import { Head } from "./Head";

interface Promo {
  id: string;
  code: string;
  percent: number;
  active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  usage_limit: number | null;
  uses: number;
}

export function PromosPage() {
  const { t } = useI18n();
  const promos = useLoad(() => api.get<Promo[]>("/promos"));
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  return (
    <>
      <Head title={t("admin.promos")}>
        <Button size="s" variant="primary" onClick={() => setEditing("new")}>
          {t("promo.new")}
        </Button>
      </Head>
      <ErrorNote error={promos.error} />
      {promos.data?.length === 0 && <Empty>{t("promo.none")}</Empty>}
      {!!promos.data?.length && (
        <Table
          head={[
            t("promo.code"),
            t("discount"),
            t("from"),
            t("to"),
            t("promo.uses"),
            t("status"),
            "",
          ]}
        >
          {promos.data.map((p) => (
            <tr key={p.id}>
              <td>
                <b>
                  <Ltr>{p.code}</Ltr>
                </b>
              </td>
              <td>
                <Ltr>{p.percent}%</Ltr>
              </td>
              <td>
                <Ltr>{p.starts_on ? formatDate(p.starts_on) : "—"}</Ltr>
              </td>
              <td>
                <Ltr>{p.ends_on ? formatDate(p.ends_on) : "—"}</Ltr>
              </td>
              <td>
                <Ltr>{p.usage_limit ? `${p.uses} / ${p.usage_limit}` : p.uses}</Ltr>
              </td>
              <td>
                <Tag tone={p.active ? "good" : ""}>{t(p.active ? "active" : "stopped")}</Tag>
              </td>
              <td>
                <Button size="s" onClick={() => setEditing(p)}>
                  {t("edit")}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="soft">{t("promo.rules")}</p>
      {editing && (
        <PromoDialog
          promo={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void promos.reload();
          }}
        />
      )}
    </>
  );
}

function PromoDialog({
  promo,
  onClose,
  onSaved,
}: {
  promo: Promo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState(promo?.code ?? "");
  const [percent, setPercent] = useState(String(promo?.percent ?? ""));
  const [active, setActive] = useState(promo?.active ?? true);
  const [starts, setStarts] = useState(promo?.starts_on ?? "");
  const [ends, setEnds] = useState(promo?.ends_on ?? "");
  const [limit, setLimit] = useState(String(promo?.usage_limit ?? ""));
  const { busy, error, run } = useAction();
  const value = parseInteger(percent);

  return (
    <Dialog title={t(promo ? "promo.edit" : "promo.new")} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("promo.code")}
          kind="latin"
          value={code}
          maxLength={20}
          onChange={(text) => setCode(text.toUpperCase())}
        />
        <Field
          label={t("promo.percent")}
          kind="digits"
          value={percent}
          maxLength={3}
          unit="%"
          onChange={setPercent}
        />
        <DateField label={t("promo.starts")} value={starts} onChange={setStarts} />
        <DateField label={t("promo.ends")} value={ends} onChange={setEnds} />
        <Field
          label={t("promo.limit")}
          kind="digits"
          value={limit}
          maxLength={7}
          onChange={setLimit}
        />
        <Segmented
          label={t("status")}
          options={[
            ["on", t("active")],
            ["off", t("stopped")],
          ]}
          value={active ? "on" : "off"}
          onChange={(v) => setActive(v === "on")}
        />
      </div>
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button onClick={onClose}>{t("back")}</Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || code.trim().length < 2 || value < 1 || value > 100}
          onClick={() =>
            run(async () => {
              const body = {
                code,
                percent: value,
                active,
                starts_on: starts || null,
                ends_on: ends || null,
                usage_limit: parseInteger(limit) || null,
              };
              if (promo) await api.put(`/promos/${promo.id}`, body);
              else await api.post("/promos", body);
              onSaved();
            })
          }
        >
          {t("save")}
        </Button>
      </div>
    </Dialog>
  );
}
