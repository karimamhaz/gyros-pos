import { useState } from "react";
import { useSession } from "../../app/session";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { bridge } from "../../shared/bridge";
import { formatDateTime, formatNumber } from "../../shared/format";
import {
  Button,
  Dialog,
  Empty,
  ErrorNote,
  Field,
  Ltr,
  Table,
  Tag,
  useAction,
  useLoad,
} from "../../shared/ui";
import { Head } from "./Head";

interface Record {
  id: string;
  kind: "session" | "recovery" | "premigrate" | "prerestore";
  filename: string;
  user: string | null;
  size: number | null;
  ok: boolean;
  created_at: string;
}

export function BackupsPage() {
  const { t } = useI18n();
  const backups = useLoad(() => api.get<{ records: Record[]; files: string[] }>("/backups"));
  const [restoring, setRestoring] = useState(false);
  const latest = backups.data?.records.find((r) => r.ok);
  return (
    <>
      <Head title={t("admin.backups")}>
        <Button variant="danger" onClick={() => setRestoring(true)}>
          {t("restore")}
        </Button>
      </Head>
      <ErrorNote error={backups.error} />
      {latest && (
        <div className="box p-4 line">
          <div>
            <b>{t("backup.latest")}</b>
            <div className="soft">
              <Ltr>{formatDateTime(latest.created_at)}</Ltr>
            </div>
          </div>
          <Tag tone="good">{t("backup.ok")}</Tag>
        </div>
      )}
      {backups.data?.records.length === 0 && <Empty>{t("backup.none")}</Empty>}
      {!!backups.data?.records.length && (
        <Table head={[t("time"), t("type"), t("backup.session"), t("backup.size"), t("status")]}>
          {backups.data.records.map((r) => (
            <tr key={r.id}>
              <td>
                <Ltr>{formatDateTime(r.created_at)}</Ltr>
              </td>
              <td>{t(`backup.kind.${r.kind}`)}</td>
              <td>
                <bdi>{r.user ?? "—"}</bdi>
              </td>
              <td>
                <Ltr>{r.size ? `${formatNumber(Math.ceil(r.size / 1024))} KB` : "—"}</Ltr>
              </td>
              <td>
                <Tag tone={r.ok ? "good" : "bad"}>{t(r.ok ? "backup.ok" : "backup.failed")}</Tag>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="soft">{t("backup.hint")}</p>
      {restoring && (
        <RestoreDialog files={backups.data?.files ?? []} onClose={() => setRestoring(false)} />
      )}
    </>
  );
}

function RestoreDialog({ files, onClose }: { files: string[]; onClose: () => void }) {
  const { t } = useI18n();
  const { leave } = useSession();
  const [file, setFile] = useState("");
  const [password, setPassword] = useState("");
  const [sure, setSure] = useState(false);
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();

  if (done) {
    return (
      <Dialog title={t("restore.done")}>
        <p>{t("restore.done.hint")}</p>
        <Button variant="primary" size="l" onClick={leave}>
          {t("continue")}
        </Button>
      </Dialog>
    );
  }
  return (
    <Dialog title={t("restore")} wide onClose={busy ? undefined : onClose}>
      <p className="soft">{t("restore.hint")}</p>
      <div className="grid gap-1.5 max-h-[230px] scroll">
        {files.map((name) => (
          <Button
            key={name}
            size="s"
            variant={file === name ? "dark" : "plain"}
            onClick={() => setFile(name)}
          >
            <Ltr>{name}</Ltr>
          </Button>
        ))}
      </div>
      {bridge && (
        <Button
          onClick={() =>
            run(async () => {
              const picked = await bridge!.chooseBackup();
              if (picked) setFile(picked);
            })
          }
        >
          {t("restore.other")}
        </Button>
      )}
      {file && (
        <p>
          {t("restore.chosen")} <Ltr>{file}</Ltr>
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        {t("restore.sure")}
      </label>
      <Field
        label={t("password.own")}
        kind="latin"
        password
        value={password}
        onChange={setPassword}
      />
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button size="l" disabled={busy} onClick={onClose}>
          {t("back")}
        </Button>
        <Button
          variant="primary"
          size="l"
          className="flex-1"
          disabled={busy || !file || !sure || !password}
          onClick={() =>
            run(async () => {
              await api.post("/backups/restore", { file, password });
              setDone(true);
            })
          }
        >
          {t("restore")}
        </Button>
      </div>
    </Dialog>
  );
}
