import { api } from "../../shared/api";
import { bridge, type PrintResult } from "../../shared/bridge";
import type { AppSettings, Receipt } from "../../shared/types";
import { receiptHtml } from "./receipt";

interface Claimed {
  kind: "receipt" | "bill" | "test";
  copy: boolean;
  payload: Receipt;
}

/** Prints one job. The job is claimed first, so the same paper cannot come out twice. */
export async function printJob(job: string, settings: AppSettings): Promise<PrintResult> {
  const { printer } = settings;
  const claimed = await api.post<Claimed>(`/print/jobs/${job}/claim`);
  let result: PrintResult;
  try {
    result = bridge
      ? await bridge.print(receiptHtml(claimed.payload, printer, claimed.copy), {
          printer: printer.printer,
          widthMm: printer.paper,
          copies: claimed.kind === "receipt" && !claimed.copy ? printer.copies : 1,
        })
      : { ok: false, error: "no_printer" };
  } catch {
    result = { ok: false, error: "failed" };
  }
  await api.post(`/print/jobs/${job}/result`, { ok: result.ok, error: result.error ?? "" });
  return result;
}
