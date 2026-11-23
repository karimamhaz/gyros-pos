import { useCallback, useEffect, useMemo, useState } from "react";
import logo from "../assets/logo.png";
import { AdminShell } from "../features/admin/AdminShell";
import { CashierShell } from "../features/order/CashierShell";
import { OpenShift } from "../features/shift/OpenShift";
import { Login } from "../features/start/Login";
import { Setup } from "../features/start/Setup";
import { StartScreen } from "../features/start/StartScreen";
import { useI18n } from "../i18n";
import { api, setToken, whenSessionLost } from "../shared/api";
import type { AppSettings, Role, Session, ShiftState } from "../shared/types";
import { Button, ErrorNote, useLoad } from "../shared/ui";
import { SessionContext } from "./session";

interface StartInfo {
  set_up: boolean;
  language: "ar" | "en";
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for the local system, then decides which first screen applies. */
export function App() {
  const { t, setLang } = useI18n();
  const [start, setStart] = useState<StartInfo | "damaged" | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const load = useCallback(async () => {
    for (;;) {
      try {
        const health = await api.get<{ status: string }>("/health");
        if (health.status === "damaged") return setStart("damaged");
        const info = await api.get<StartInfo>("/auth/start");
        setLang(info.language);
        return setStart(info);
      } catch {
        await wait(400);
      }
    }
  }, [setLang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the request
    void load();
  }, [load]);

  const leave = useCallback(() => {
    setToken(null);
    setSession(null);
    setRole(null);
    void load();
  }, [load]);

  useEffect(() => whenSessionLost(leave), [leave]);

  if (!start || start === "damaged") {
    return (
      <div className="screen dark">
        <img src={logo} alt="Gyros" width={420} />
        <p>{start ? t("app.damaged") : t("app.starting")}</p>
      </div>
    );
  }
  if (session) return <LoggedIn session={session} leave={leave} />;
  if (!start.set_up) return <Setup onDone={load} />;
  if (!role) return <StartScreen onPick={setRole} />;
  return (
    <Login
      role={role}
      onBack={() => setRole(null)}
      onLogin={(value) => {
        setToken(value.token);
        setSession(value);
      }}
    />
  );
}

function LoggedIn({ session, leave }: { session: Session; leave: () => void }) {
  const { t } = useI18n();
  const settings = useLoad(() => api.get<AppSettings>("/settings"));
  const shift = useLoad(() => api.get<ShiftState>("/shifts/current"));
  const [selling, setSelling] = useState(session.role === "cashier");
  const { reload } = settings;
  const value = useMemo(
    () => settings.data && { session, settings: settings.data, reloadSettings: reload, leave },
    [session, settings.data, reload, leave],
  );

  if (!value || !shift.data) {
    const error = settings.error ?? shift.error;
    return (
      <div className="screen dark">
        <p>{error ? "" : t("app.starting")}</p>
        <ErrorNote error={error} />
        {error ? (
          <Button
            onClick={() => {
              void settings.reload();
              void shift.reload();
            }}
          >
            {t("retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  const toAdmin = session.role === "admin" ? () => setSelling(false) : undefined;
  let screen;
  if (!selling) {
    screen = (
      <AdminShell
        shift={shift.data}
        reloadShift={shift.reload}
        onSell={() => {
          void shift.reload();
          setSelling(true);
        }}
      />
    );
  } else if (!shift.data.mine) {
    screen = <OpenShift shift={shift.data} onOpen={shift.reload} onBack={toAdmin ?? leave} />;
  } else {
    screen = <CashierShell shift={shift.data} onAdmin={toAdmin} />;
  }
  return <SessionContext.Provider value={value}>{screen}</SessionContext.Provider>;
}
