import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { formatDateTime } from "../../shared/format";
import { Button, Empty, ErrorNote, Ltr, Table, Tag, useAction, useLoad } from "../../shared/ui";
import { PrintStatus } from "./PrintStatus";

interface Problem {
  id: string;
  number: number | null;
  kind: "receipt" | "bill" | "test";
  copy: boolean;
  state: "pending" | "failed" | "unknown";
  created_at: string;
}

/** Papers that did not come out, or may not have. */
export function PrintProblems() {
  const { t } = useI18n();
  const jobs = useLoad(() => api.get<Problem[]>("/print/problems"));
  const [printing, setPrinting] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const act = (path: string, body?: unknown) =>
    run(async () => {
      await api.post(path, body);
      await jobs.reload();
    });

  if (!jobs.data) return <ErrorNote error={jobs.error} />;
  if (!jobs.data.length) return <Empty>{t("print.none")}</Empty>;
  return (
    <>
      <ErrorNote error={error} />
      <Table head={[t("order"), t("time"), t("print.kind"), t("status"), ""]}>
        {jobs.data.map((job) => (
          <tr key={job.id}>
            <td>
              <b>{job.number ? <Ltr>#{job.number}</Ltr> : "—"}</b>
            </td>
            <td>
              <Ltr>{formatDateTime(job.created_at)}</Ltr>
            </td>
            <td>{t(`print.kind.${job.kind}`)}</td>
            <td>
              <Tag tone={job.state === "pending" ? "warn" : "bad"}>
                {t(`print.state.${job.state}`)}
              </Tag>
            </td>
            <td>
              {printing === job.id ? (
                <PrintStatus job={job.id} onSettled={jobs.reload} />
              ) : job.state === "unknown" ? (
                <div className="flex gap-2">
                  <Button
                    size="s"
                    disabled={busy}
                    onClick={() => act(`/print/jobs/${job.id}/resolve`, { printed: true })}
                  >
                    {t("print.came_out")}
                  </Button>
                  <Button
                    size="s"
                    disabled={busy}
                    onClick={() => act(`/print/jobs/${job.id}/resolve`, { printed: false })}
                  >
                    {t("print.did_not")}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="s" variant="dark" onClick={() => setPrinting(job.id)}>
                    {t("print.now")}
                  </Button>
                  <Button
                    size="s"
                    disabled={busy}
                    onClick={() => act(`/print/jobs/${job.id}/dismiss`)}
                  >
                    {t("print.skip")}
                  </Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
