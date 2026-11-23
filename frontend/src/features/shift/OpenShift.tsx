import { useState } from "react";
import { useSession } from "../../app/session";
import logo from "../../assets/logo.png";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { ShiftState } from "../../shared/types";
import { Button, ErrorNote, Field, Lbp, Line, Usd, useAction } from "../../shared/ui";
import { CountFields, emptyCount } from "./CountFields";

interface Props {
  shift: ShiftState;
  onOpen: () => void;
  onBack: () => void;
}

export function OpenShift({ shift, onOpen, onBack }: Props) {
  const { t } = useI18n();
  const { session, settings, leave } = useSession();
  const [count, setCount] = useState(() => emptyCount(shift.count_mode));
  const [password, setPassword] = useState("");
  const [leaving, setLeaving] = useState(false);
  const { busy, error, run } = useAction();

  if (shift.open) {
    return (
      <div className="screen dark">
        <div className="card">
          <h2>{t("shift.other", { name: shift.cashier })}</h2>
          <p className="soft">{t("shift.other.hint")}</p>
          <Button size="l" onClick={onBack}>
            {t("back")}
          </Button>
        </div>
      </div>
    );
  }
  const cashier = session.role === "cashier";
  return (
    <div className="screen dark">
      <img src={logo} alt="Gyros" width={170} />
      <div className="card" style={{ width: count.notes ? 640 : 520 }}>
        <div>
          <h2>{t("shift.open")}</h2>
          <p className="soft">
            {t(shift.count_mode === "closing_only" ? "shift.open.fixed" : "shift.open.hint")}
          </p>
        </div>
        {shift.count_mode === "closing_only" ? (
          <>
            <Line label="USD">
              <Usd cents={settings.fixed_opening_usd} />
            </Line>
            <Line label={t("lbp")}>
              <Lbp value={settings.fixed_opening_lbp} />
            </Line>
          </>
        ) : (
          <CountFields value={count} onChange={setCount} />
        )}
        {!leaving && <ErrorNote error={error} />}
        <Button
          variant="primary"
          size="l"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.post("/shifts/open", { count });
              onOpen();
            })
          }
        >
          {t("shift.start")}
        </Button>
        {!leaving ? (
          <Button onClick={() => (cashier ? setLeaving(true) : onBack())}>
            {t(cashier ? "logout" : "back")}
          </Button>
        ) : (
          <>
            <Field
              label={t("password.own")}
              kind="latin"
              password
              autoFocus
              value={password}
              onChange={setPassword}
            />
            <ErrorNote error={error} />
            <Button
              disabled={busy || !password}
              onClick={() =>
                run(async () => {
                  await api.post("/auth/logout", { password });
                  leave();
                })
              }
            >
              {t("logout")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
