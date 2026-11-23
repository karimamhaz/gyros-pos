import { useState } from "react";
import { useSession } from "../../app/session";
import logo from "../../assets/logo.png";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { ShiftState } from "../../shared/types";
import { Button, Dialog, ErrorNote, Field, Ltr, useAction, useLoad } from "../../shared/ui";
import { CountFields, emptyCount } from "./CountFields";

interface Props {
  shift: ShiftState;
  tables: number;
  deliveries: number;
  onClose: () => void;
}

export function EndShift({ shift, tables, deliveries, onClose }: Props) {
  const { t } = useI18n();
  const { session, leave } = useSession();
  const [count, setCount] = useState(() => emptyCount(shift.count_mode));
  const [password, setPassword] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const drafts = useLoad(() => api.get<unknown[]>("/orders/drafts"));

  if (reference) {
    return (
      <div className="screen dark fixed inset-0 z-30">
        <img src={logo} alt="Gyros" width={220} />
        <div className="card text-center">
          <h1>{t("shift.closed")}</h1>
          <div>
            <div className="soft">{t("shift.reference")}</div>
            <div className="text-[36px] font-bold" data-testid="reference">
              <Ltr>{reference}</Ltr>
            </div>
          </div>
          <p className="soft">{t("shift.reference.hint")}</p>
          <Button variant="primary" size="l" onClick={leave}>
            {t("shift.finish")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Dialog title={t("shift.end")} onClose={busy ? undefined : onClose}>
      <p className="soft">
        {t("shift.passes", { tables, deliveries, drafts: drafts.data?.length ?? 0 })}
      </p>
      <CountFields value={count} onChange={setCount} />
      <Field
        label={t("password.own")}
        kind="latin"
        password
        value={password}
        onChange={setPassword}
      />
      {session.role === "cashier" && <p className="soft text-sm">{t("shift.admin_too")}</p>}
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button size="l" disabled={busy} onClick={onClose}>
          {t("back")}
        </Button>
        <Button
          variant="primary"
          size="l"
          className="flex-1"
          disabled={busy || !password}
          onClick={() =>
            run(async () => {
              const body = { password, count };
              setReference(
                (await api.post<{ reference: string }>("/shifts/close", body)).reference,
              );
            })
          }
        >
          {t("shift.end_and_leave")}
        </Button>
      </div>
    </Dialog>
  );
}
