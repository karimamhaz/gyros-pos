import { useState } from "react";
import { LanguageButton } from "../../app/LanguageButton";
import logo from "../../assets/logo.png";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { Role, Session } from "../../shared/types";
import { Button, ErrorNote, Field, useAction, useLoad } from "../../shared/ui";
import { Recover } from "./Recover";

interface Props {
  role: Role;
  onBack: () => void;
  onLogin: (session: Session) => void;
}

export function Login({ role, onBack, onLogin }: Props) {
  const { t } = useI18n();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [recovering, setRecovering] = useState(false);
  const cashiers = useLoad(() => api.get<{ id: string; name: string }[]>("/auth/cashiers"));
  const { busy, error, run } = useAction();
  const cashier = role === "cashier";

  const login = () =>
    run(async () => {
      try {
        onLogin(
          await api.post<Session>(
            `/auth/login/${role}`,
            cashier ? { user_id: user, password } : { username: user, password },
          ),
        );
      } catch (e) {
        setPassword("");
        throw e;
      }
    });

  if (recovering) return <Recover onBack={() => setRecovering(false)} />;
  return (
    <div className="screen dark">
      <LanguageButton className="corner" />
      <img src={logo} alt="Gyros" width={220} />
      <div className="card">
        <h2>{t(cashier ? "login.cashier" : "login.admin")}</h2>
        {cashier ? (
          <div>
            <div className="label">{t("login.who")}</div>
            {cashiers.data?.length === 0 && <p className="soft">{t("login.no_cashiers")}</p>}
            <div className="picker" role="radiogroup" aria-label={t("login.who")}>
              {cashiers.data?.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  role="radio"
                  aria-checked={c.id === user}
                  className={c.id === user ? "on" : ""}
                  onClick={() => setUser(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Field
            label={t("username")}
            kind="latin"
            value={user}
            onChange={setUser}
            maxLength={30}
            autoFocus
          />
        )}
        <Field
          key={user && cashier ? "ready" : "waiting"}
          label={t("password")}
          kind="latin"
          password
          autoFocus={cashier && user !== ""}
          value={password}
          onChange={setPassword}
          onEnter={login}
          maxLength={100}
        />
        <ErrorNote error={error ?? cashiers.error} />
        <Button variant="primary" size="l" disabled={busy || !user || !password} onClick={login}>
          {t("login.enter")}
        </Button>
        <Button onClick={onBack}>{t("back")}</Button>
        {!cashier && (
          <button type="button" className="link" onClick={() => setRecovering(true)}>
            {t("login.forgot")}
          </button>
        )}
      </div>
    </div>
  );
}
