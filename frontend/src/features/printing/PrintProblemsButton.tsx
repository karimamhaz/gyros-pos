import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { Button, Dialog, useLoad } from "../../shared/ui";
import { PrintProblems } from "./PrintProblems";

/** Appears only when some paper still needs attention. */
export function PrintProblemsButton({ watch }: { watch: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const jobs = useLoad(() => api.get<unknown[]>("/print/problems"), watch);
  const close = () => {
    setOpen(false);
    void jobs.reload();
  };
  if (!jobs.data?.length && !open) return null;
  return (
    <>
      <button type="button" className="outline" onClick={() => setOpen(true)}>
        {t("print.problems")} <b className="count">{jobs.data?.length ?? 0}</b>
      </button>
      {open && (
        <Dialog title={t("print.problems")} wide onClose={close}>
          <PrintProblems />
          <Button onClick={close}>{t("back")}</Button>
        </Dialog>
      )}
    </>
  );
}
