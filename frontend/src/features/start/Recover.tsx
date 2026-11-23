import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { Button, ErrorNote, Field, useAction } from "../../shared/ui";
import { RecoveryKey } from "./RecoveryKey";

export function Recover({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [password, setPassword] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  if (next) return <RecoveryKey value={next} onDone={onBack} />;
  return (
    <div className="screen dark">
      <div className="card" style={{ width: 560 }}>
        <h2>{t("recover.title")}</h2>
        <Field label={t("recover.key")} kind="latin" value={key} onChange={setKey} maxLength={60} />
        <Field
          label={t("setup.password")}
          kind="latin"
          password
          value={password}
          onChange={setPassword}
          maxLength={100}
        />
        <ErrorNote error={error} />
        <Button
          variant="primary"
          size="l"
          disabled={busy || !key || password.length < 8}
          onClick={() =>
            run(async () => {
              const body = { recovery_key: key, password };
              const result = await api.post<{ recovery_key: string }>("/auth/recover", body);
              setNext(result.recovery_key);
            })
          }
        >
          {t("recover.save")}
        </Button>
        <Button onClick={onBack}>{t("back")}</Button>
      </div>
    </div>
  );
}
