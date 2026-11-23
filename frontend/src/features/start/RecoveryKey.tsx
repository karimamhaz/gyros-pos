import { useState } from "react";
import { useI18n } from "../../i18n";
import { Button, Ltr } from "../../shared/ui";

export function RecoveryKey({ value, onDone }: { value: string; onDone: () => void }) {
  const { t } = useI18n();
  const [written, setWritten] = useState(false);
  return (
    <div className="screen dark">
      <div className="card" style={{ width: 620 }}>
        <h2>{t("recovery.title")}</h2>
        <p>{t("recovery.hint")}</p>
        <div className="code-box">
          <Ltr>{value}</Ltr>
        </div>
        <label className="check">
          <input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} />
          {t("recovery.written")}
        </label>
        <Button variant="primary" size="l" disabled={!written} onClick={onDone}>
          {t("continue")}
        </Button>
      </div>
    </div>
  );
}
