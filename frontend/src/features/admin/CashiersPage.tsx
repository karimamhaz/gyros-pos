import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
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

interface Cashier {
  id: string;
  username: string;
  display_name: string;
  active: boolean;
}
type Asking = "new" | { rename: Cashier } | { password: Cashier } | null;

export function CashiersPage() {
  const { t } = useI18n();
  const cashiers = useLoad(() => api.get<Cashier[]>("/cashiers"));
  const [asking, setAsking] = useState<Asking>(null);
  const { busy, error, run } = useAction();
  const done = () => {
    setAsking(null);
    void cashiers.reload();
  };

  return (
    <>
      <Head title={t("admin.cashiers")}>
        <Button size="s" variant="primary" onClick={() => setAsking("new")}>
          {t("cashier.new")}
        </Button>
      </Head>
      <ErrorNote error={error ?? cashiers.error} />
      {cashiers.data?.length === 0 && <Empty>{t("cashier.none")}</Empty>}
      {!!cashiers.data?.length && (
        <Table head={[t("name"), t("username"), t("status"), ""]}>
          {cashiers.data.map((c) => (
            <tr key={c.id}>
              <td>
                <b>
                  <bdi>{c.display_name}</bdi>
                </b>
              </td>
              <td>
                <Ltr>{c.username}</Ltr>
              </td>
              <td>
                <Tag tone={c.active ? "good" : "bad"}>{t(c.active ? "active" : "stopped")}</Tag>
              </td>
              <td>
                <div className="flex gap-2 justify-end">
                  <Button size="s" onClick={() => setAsking({ rename: c })}>
                    {t("cashier.rename")}
                  </Button>
                  <Button size="s" onClick={() => setAsking({ password: c })}>
                    {t("cashier.password")}
                  </Button>
                  <Button
                    size="s"
                    variant={c.active ? "danger" : "plain"}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const body = { display_name: c.display_name, active: !c.active };
                        await api.put(`/cashiers/${c.id}`, body);
                        await cashiers.reload();
                      })
                    }
                  >
                    {t(c.active ? "cashier.stop" : "cashier.start")}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {asking && <CashierDialog asking={asking} onClose={() => setAsking(null)} onDone={done} />}
    </>
  );
}

function CashierDialog({
  asking,
  onClose,
  onDone,
}: {
  asking: Exclude<Asking, null>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const isNew = asking === "new";
  const rename = !isNew && "rename" in asking ? asking.rename : null;
  const changing = !isNew && "password" in asking ? asking.password : null;
  const [name, setName] = useState(rename?.display_name ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();
  const needsName = isNew || rename !== null;
  const needsPassword = isNew || changing !== null;
  const ready =
    (!needsName || name.trim()) &&
    (!isNew || username.trim().length >= 2) &&
    (!needsPassword || password.length >= 4);

  return (
    <Dialog
      title={isNew ? t("cashier.new") : <bdi>{(rename ?? changing)?.display_name}</bdi>}
      onClose={onClose}
    >
      {needsName && <Field label={t("name")} value={name} onChange={setName} maxLength={40} />}
      {isNew && (
        <Field
          label={t("cashier.username")}
          kind="latin"
          value={username}
          onChange={setUsername}
          maxLength={30}
        />
      )}
      {needsPassword && (
        <Field
          label={t("cashier.password.hint")}
          kind="latin"
          password
          value={password}
          onChange={setPassword}
          maxLength={100}
        />
      )}
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button onClick={onClose}>{t("back")}</Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || !ready}
          onClick={() =>
            run(async () => {
              if (isNew) {
                await api.post("/cashiers", { username, display_name: name, password });
              } else if (rename) {
                const body = { display_name: name, active: rename.active };
                await api.put(`/cashiers/${rename.id}`, body);
              } else if (changing) {
                await api.put(`/cashiers/${changing.id}/password`, { password });
              }
              onDone();
            })
          }
        >
          {t("save")}
        </Button>
      </div>
    </Dialog>
  );
}
