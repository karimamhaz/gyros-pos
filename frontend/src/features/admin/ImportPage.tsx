import { useRef, useState } from "react";
import { useI18n, type Key } from "../../i18n";
import { api } from "../../shared/api";
import { formatNumber } from "../../shared/format";
import { Button, ErrorNote, Ltr, Segmented, Table, Tag, useAction } from "../../shared/ui";
import { Head } from "./Head";

interface Row {
  line: number;
  name: string;
  category: string;
  price_lbp: number | null;
  available: boolean;
  result: "new" | "update" | "same" | "similar" | "error";
  errors: string[];
  match: string | null;
  old_price: number | null;
}
interface Preview {
  menu_version: string;
  rows: Row[];
}
type Mode = "add" | "add_and_update";
const TONE = { new: "good", update: "warn", same: "", similar: "warn", error: "bad" } as const;

const base64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function ImportPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ filename: string; content: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<Mode>("add");
  const [done, setDone] = useState<{ added: number; updated: number; skipped: number } | null>(
    null,
  );
  const { busy, error, run } = useAction();

  const choose = (picked: File) =>
    run(async () => {
      setPreview(null);
      setDone(null);
      const upload = { filename: picked.name, content: await base64(picked) };
      setFile(upload);
      setPreview(await api.post<Preview>("/menu/import/preview", upload));
    });
  const count = (result: Row["result"]) =>
    preview?.rows.filter((r) => r.result === result).length ?? 0;
  const willAdd = count("new");
  const willUpdate = mode === "add_and_update" ? count("update") : 0;

  return (
    <>
      <Head title={t("import.title")}>
        <Button size="s" onClick={onBack}>
          {t("back")}
        </Button>
        <Button size="s" variant="dark" disabled={busy} onClick={() => input.current?.click()}>
          {t("import.choose")}
        </Button>
      </Head>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) void choose(picked);
        }}
      />
      {!preview && !done && <p className="soft">{t("import.hint")}</p>}
      <ErrorNote error={error} />
      {done && <div className="status good">{t("import.done", { ...done })}</div>}
      {preview && !done && file && (
        <>
          <div className="box p-3.5 line">
            <b>
              <Ltr>{file.filename}</Ltr>
            </b>
            <div className="flex gap-2">
              {(["new", "update", "same", "similar", "error"] as const).map(
                (r) =>
                  count(r) > 0 && (
                    <Tag key={r} tone={TONE[r]}>
                      {t(`import.${r}`)} {count(r)}
                    </Tag>
                  ),
              )}
            </div>
          </div>
          <Table
            head={[
              t("import.line"),
              t("product"),
              t("category"),
              t("price"),
              t("available"),
              t("import.result"),
            ]}
          >
            {preview.rows.map((r) => (
              <tr key={r.line}>
                <td>{r.line}</td>
                <td>
                  <b>
                    <bdi>{r.name || "—"}</bdi>
                  </b>
                </td>
                <td>
                  <bdi>{r.category || "—"}</bdi>
                </td>
                <td>
                  <Ltr>{r.price_lbp === null ? "—" : formatNumber(r.price_lbp)}</Ltr>
                </td>
                <td>{t(r.available ? "yes" : "no")}</td>
                <td>
                  {r.result === "error" ? (
                    <div className="flex gap-1 flex-wrap">
                      {r.errors.map((e) => (
                        <Tag key={e} tone="bad">
                          {t(`import.error.${e}` as Key)}
                        </Tag>
                      ))}
                    </div>
                  ) : (
                    <Tag tone={TONE[r.result]}>
                      {r.result === "similar" ? (
                        <>
                          {t("import.looks_like")} <bdi>{r.match}</bdi>
                        </>
                      ) : r.result === "update" && r.old_price !== r.price_lbp ? (
                        <>
                          {t("import.was")} <Ltr>{formatNumber(r.old_price ?? 0)}</Ltr>
                        </>
                      ) : (
                        t(`import.${r.result}`)
                      )}
                    </Tag>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <div className="box p-4 grid gap-3">
            <Segmented<Mode>
              label={t("import.question")}
              options={[
                ["add", t("import.add")],
                ["add_and_update", t("import.add_and_update")],
              ]}
              value={mode}
              onChange={setMode}
            />
            <div className="line">
              <span className="soft">{t("import.skipped_hint")}</span>
              <Button
                variant="primary"
                disabled={busy || willAdd + willUpdate === 0}
                onClick={() =>
                  run(async () => {
                    const body = { ...file, mode, menu_version: preview.menu_version };
                    setDone(await api.post("/menu/import/apply", body));
                  })
                }
              >
                {t("import.apply", { add: willAdd, update: willUpdate })}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
