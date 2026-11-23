import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { parseInteger } from "../../shared/format";
import type { Order } from "../../shared/types";
import { Button, ErrorNote, Field, useAction } from "../../shared/ui";
import { PrintStatus } from "../printing/PrintStatus";
import { OrderDetails } from "./OrderDetails";
import { RefundDialog } from "./RefundDialog";

export function FindOrder() {
  const { t } = useI18n();
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Order | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const { busy, error, run } = useAction();

  const search = () =>
    run(async () => {
      setFound(null);
      setJob(null);
      const body = { number: parseInteger(number), code };
      setFound(await api.post<Order>("/orders/lookup", body));
    });

  return (
    <main className="page scroll items-center">
      <div className="w-[640px] max-w-full grid gap-4 pt-5">
        <div>
          <h1>{t("tab.find")}</h1>
          <p className="soft">{t("find.hint")}</p>
        </div>
        <div className="grid gap-3 items-end" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
          <Field
            label={t("find.number")}
            kind="digits"
            value={number}
            onChange={setNumber}
            maxLength={6}
          />
          <Field
            label={t("find.code")}
            kind="latin"
            value={code}
            onChange={(text) => setCode(text.toUpperCase())}
            maxLength={10}
            onEnter={search}
          />
          <Button variant="dark" disabled={busy || !parseInteger(number) || !code} onClick={search}>
            {t("find.search")}
          </Button>
        </div>
        <ErrorNote error={error} />
        {found && (
          <div className="box p-5 grid gap-3">
            <OrderDetails order={found} />
            {job ? (
              <PrintStatus key={job} job={job} />
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="dark"
                  className="flex-1"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const path = `/print/orders/${found.id}/reprint`;
                      setJob((await api.post<{ job: string }>(path, { code })).job);
                    })
                  }
                >
                  {t("find.reprint")}
                </Button>
                {(found.state === "completed" ||
                  (found.state === "confirmed" && found.paid > 0)) && (
                  <Button variant="danger" onClick={() => setRefunding(true)}>
                    {t("refund")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {refunding && found && (
        <RefundDialog
          order={found}
          code={code}
          onClose={() => setRefunding(false)}
          onDone={(order) => {
            setFound(order);
            setRefunding(false);
          }}
        />
      )}
    </main>
  );
}
