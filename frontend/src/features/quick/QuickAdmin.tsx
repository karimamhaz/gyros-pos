import { useEffect, useState } from "react";
import logo from "../../assets/logo.png";
import { useSession } from "../../app/session";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { Product } from "../../shared/types";
import {
  AmountField,
  Button,
  Dialog,
  ErrorNote,
  Field,
  Lbp,
  Ltr,
  Table,
  Tag,
  useAction,
  useLoad,
} from "../../shared/ui";

/** Availability and exchange rate only; the shift stays open. */
export function QuickAdmin({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [seconds, setSeconds] = useState<number | null>(null);
  const { busy, error, run } = useAction();

  if (seconds !== null) return <Open seconds={seconds} onClose={onClose} />;
  return (
    <div className="screen dark">
      <Dialog title={t("quick.title")} onClose={onClose}>
        <p className="soft">{t("quick.hint")}</p>
        <Field
          label={t("approval.password")}
          kind="latin"
          password
          autoFocus
          value={password}
          onChange={setPassword}
        />
        <ErrorNote error={error} />
        <div className="flex gap-3">
          <Button size="l" onClick={onClose}>
            {t("back")}
          </Button>
          <Button
            variant="primary"
            size="l"
            className="flex-1"
            disabled={busy || !password}
            onClick={() =>
              run(async () => {
                setPassword("");
                const answer = await api.post<{ seconds: number }>("/auth/quick-admin", {
                  password,
                });
                setSeconds(answer.seconds);
              })
            }
          >
            {t("login.enter")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Open({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  const { t } = useI18n();
  const { settings, reloadSettings } = useSession();
  const [left, setLeft] = useState(seconds);
  const [rate, setRate] = useState(settings.rate ?? 0);
  const [saved, setSaved] = useState(false);
  const menu = useLoad(() => api.get<{ products: Product[] }>("/menu/all"));
  const { busy, error, run } = useAction();

  const close = async () => {
    await api.delete("/auth/quick-admin").catch(() => {});
    await reloadSettings();
    onClose();
  };

  useEffect(() => {
    const end = Date.now() + seconds * 1000;
    const timer = setInterval(() => {
      const now = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(now);
      if (now === 0) {
        clearInterval(timer);
        onClose();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds, onClose]);

  return (
    <div className="screen">
      <header className="topbar" style={{ borderBottom: "5px solid var(--color-brand)" }}>
        <img src={logo} alt="Gyros" style={{ height: 46 }} />
        <b className="flex-1">{t("quick.title")}</b>
        <span>
          {t("quick.closes_in")}{" "}
          <Ltr>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</Ltr>
        </span>
        <button type="button" className="outline" onClick={close}>
          {t("quick.back")}
        </button>
      </header>
      <main className="page" style={{ flexDirection: "row" }}>
        <div className="flex-1 grid gap-3 min-h-0 content-start scroll">
          <ErrorNote error={error ?? menu.error} />
          <Table head={[t("product"), t("price"), t("product.selling")]}>
            {menu.data?.products.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>
                    <bdi>{p.name}</bdi>
                  </b>
                </td>
                <td>
                  <Lbp value={p.price_lbp} />
                </td>
                <td>
                  <div className="flex gap-3 items-center">
                    <Tag tone={p.available ? "good" : "bad"}>
                      {t(p.available ? "available" : "unavailable")}
                    </Tag>
                    <Button
                      size="s"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const body = { available: !p.available };
                          await api.put(`/menu/products/${p.id}/available`, body);
                          await menu.reload();
                        })
                      }
                    >
                      {t(p.available ? "product.stop" : "product.start")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="box p-5 grid gap-4 content-start w-[370px]">
          <h2>{t("rate")}</h2>
          <AmountField
            label={t("rate.one_usd")}
            currency="LBP"
            value={rate}
            onChange={(value) => {
              setSaved(false);
              setRate(value);
            }}
          />
          <p className="soft">{t("rate.hint")}</p>
          {saved && <div className="status good">{t("saved")}</div>}
          <Button
            variant="dark"
            disabled={busy || !rate}
            onClick={() =>
              run(async () => {
                await api.put("/settings/rate", { rate });
                setSaved(true);
              })
            }
          >
            {t("rate.save")}
          </Button>
        </div>
      </main>
    </div>
  );
}
