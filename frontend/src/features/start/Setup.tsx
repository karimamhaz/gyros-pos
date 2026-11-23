import { useState } from "react";
import { LanguageButton } from "../../app/LanguageButton";
import logo from "../../assets/logo.png";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { AmountField, Button, ErrorNote, Field, useAction } from "../../shared/ui";
import { RecoveryKey } from "./RecoveryKey";

export function Setup({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [rate, setRate] = useState(0);
  const [key, setKey] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const mismatch = again !== "" && again !== password;

  if (key) return <RecoveryKey value={key} onDone={onDone} />;
  return (
    <div className="screen dark">
      <LanguageButton className="corner" />
      <img src={logo} alt="Gyros" width={180} />
      <div className="card">
        <div>
          <h2>{t("setup.title")}</h2>
          <p className="soft">{t("setup.hint")}</p>
        </div>
        <Field
          label={t("setup.username")}
          kind="latin"
          value={username}
          onChange={setUsername}
          maxLength={30}
        />
        <Field
          label={t("setup.password")}
          kind="latin"
          password
          value={password}
          onChange={setPassword}
          maxLength={100}
        />
        <Field
          label={t("password.again")}
          kind="latin"
          password
          value={again}
          onChange={setAgain}
          maxLength={100}
        />
        {mismatch && <div className="error-note">{t("password.mismatch")}</div>}
        <AmountField label={t("rate.one_usd")} currency="LBP" value={rate} onChange={setRate} />
        <ErrorNote error={error} />
        <Button
          variant="primary"
          size="l"
          disabled={
            busy || username.trim().length < 2 || password.length < 8 || again !== password || !rate
          }
          onClick={() =>
            run(async () => {
              const body = { username, password, rate };
              setKey((await api.post<{ recovery_key: string }>("/auth/setup", body)).recovery_key);
            })
          }
        >
          {t("setup.start")}
        </Button>
      </div>
    </div>
  );
}
