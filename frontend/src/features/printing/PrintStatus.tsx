import { useEffect, useRef, useState } from "react";
import { useSession } from "../../app/session";
import { useI18n, type Key } from "../../i18n";
import { api } from "../../shared/api";
import { Button, ErrorNote, useAction } from "../../shared/ui";
import { printJob } from "./print";

const REASONS: Record<string, Key> = {
  no_printer: "print.no_printer",
  printer_missing: "print.printer_missing",
  timeout: "print.timeout",
};

/** Prints a job and shows how it went, with retry. */
export function PrintStatus({
  job,
  auto = true,
  onSettled,
}: {
  job: string;
  auto?: boolean;
  onSettled?: () => void;
}) {
  const { t } = useI18n();
  const { settings } = useSession();
  const [state, setState] = useState<"waiting" | "printing" | "printed" | "failed" | "skipped">(
    auto ? "printing" : "waiting",
  );
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction();
  const started = useRef(false);

  const print = () =>
    run(async () => {
      setState("printing");
      try {
        const result = await printJob(job, settings);
        setReason(result.error ?? "");
        setState(result.ok ? "printed" : "failed");
        if (result.ok) onSettled?.();
      } catch (e) {
        setState("failed");
        throw e;
      }
    });

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true; // one automatic attempt, also in React's development double run
    void print();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "printing") return <div className="status">{t("print.printing")}</div>;
  if (state === "printed") return <div className="status good">{t("print.printed")}</div>;
  if (state === "skipped") return <div className="status">{t("print.skipped")}</div>;
  return (
    <div className="grid gap-3">
      {state === "failed" && (
        <div className="error-note" role="alert">
          <div>{t("print.failed")}</div>
          <div className="font-normal">{t(REASONS[reason] ?? "print.check")}</div>
        </div>
      )}
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button variant="dark" className="flex-1" disabled={busy} onClick={print}>
          {t(state === "failed" ? "print.again" : "print.now")}
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.post(`/print/jobs/${job}/dismiss`);
              setState("skipped");
              onSettled?.();
            })
          }
        >
          {t("print.skip")}
        </Button>
      </div>
    </div>
  );
}
