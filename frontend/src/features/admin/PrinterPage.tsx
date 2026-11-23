import { useMemo, useState } from "react";
import { useI18n, type Key } from "../../i18n";
import { api } from "../../shared/api";
import { bridge } from "../../shared/bridge";
import type { PrinterSettings } from "../../shared/types";
import {
  Button,
  ChoiceField,
  ErrorNote,
  Field,
  Segmented,
  useAction,
  useLoad,
} from "../../shared/ui";
import { PrintProblems } from "../printing/PrintProblems";
import { PrintStatus } from "../printing/PrintStatus";
import { receiptHtml, sampleReceipt } from "../printing/receipt";
import { Head } from "./Head";
import { useSettingsForm } from "./useSettingsForm";

const SHOWN: [keyof PrinterSettings, Key][] = [
  ["show_logo", "printer.logo"],
  ["show_address", "printer.address"],
  ["show_phone", "printer.phone"],
  ["show_cashier", "printer.cashier"],
  ["show_usd", "printer.usd"],
  ["show_rate", "printer.rate"],
  ["show_footer", "printer.footer"],
];

/** Everything about paper, with a live preview of the exact page that prints. */
export function PrinterPage() {
  const { t } = useI18n();
  const form = useSettingsForm();
  const { draft, set, save, saved, busy, error } = form;
  const p = draft.printer;
  const change = (part: Partial<PrinterSettings>) => set({ printer: { ...p, ...part } });
  const printers = useLoad(async () => (bridge ? bridge.printers() : []));
  const test = useAction();
  const [job, setJob] = useState<string | null>(null);
  const [problems, setProblems] = useState(false);

  const html = useMemo(() => {
    const shop = {
      name: draft.receipt_name,
      phone: draft.receipt_phone,
      address: draft.receipt_address,
      footer: draft.receipt_footer,
    };
    return receiptHtml(sampleReceipt(shop, draft.rate ?? 89500), p);
  }, [draft, p]);

  const choices: [string, string][] = [
    ["", t("printer.none")],
    ...(printers.data?.map((x) => [x.name, x.label] as [string, string]) ?? []),
  ];
  if (p.printer && !choices.some(([name]) => name === p.printer)) {
    choices.push([p.printer, `${p.printer} (${t("printer.gone")})`]);
  }
  const stepper = (
    label: Key,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    apply: (v: number) => void,
  ) => (
    <div>
      <div className="label">{t(label)}</div>
      <div className="qty w-fit">
        <button type="button" aria-label="+" onClick={() => apply(Math.min(max, value + step))}>
          +
        </button>
        <span className="px-3" dir="ltr">
          {value} {unit}
        </span>
        <button type="button" aria-label="-" onClick={() => apply(Math.max(min, value - step))}>
          −
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Head title={t("admin.printer")}>
        {saved && <div className="status good">{t("saved")}</div>}
        <Button onClick={() => setProblems(!problems)}>
          {t(problems ? "printer.back_to_layout" : "print.problems")}
        </Button>
        <Button
          variant="dark"
          disabled={busy || test.busy}
          onClick={() =>
            test.run(async () => {
              await save();
              setJob((await api.post<{ job: string }>("/print/test")).job);
            })
          }
        >
          {t("printer.save_and_test")}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          {t("settings.save")}
        </Button>
      </Head>
      <ErrorNote error={error ?? test.error ?? printers.error} />
      {job && <PrintStatus key={job} job={job} />}
      {problems ? (
        <PrintProblems />
      ) : (
        <div className="flex gap-4 min-h-0 flex-1">
          <div className="grid grid-cols-2 gap-4 flex-1 scroll content-start">
            <section className="box p-5 grid gap-3.5 content-start">
              <h2>{t("printer.paper_section")}</h2>
              <ChoiceField
                label={t("printer.choose")}
                value={p.printer}
                options={choices}
                onChange={(printer) => change({ printer })}
              />
              <Segmented
                label={t("printer.width")}
                options={[
                  ["80", t("printer.mm", { width: 80 })],
                  ["58", t("printer.mm", { width: 58 })],
                ]}
                value={String(p.paper)}
                onChange={(v) => change({ paper: v === "58" ? 58 : 80 })}
              />
              <Segmented
                label={t("printer.auto")}
                options={[
                  ["on", t("on")],
                  ["off", t("off")],
                ]}
                value={p.auto_print ? "on" : "off"}
                onChange={(v) => change({ auto_print: v === "on" })}
              />
              <div className="grid grid-cols-3 gap-2">
                {stepper("printer.copies", p.copies, 1, 3, 1, "", (copies) => change({ copies }))}
                {stepper("printer.margin", p.side_margin_mm, 0, 10, 1, "mm", (side_margin_mm) =>
                  change({ side_margin_mm }),
                )}
                {stepper("printer.feed", p.feed_mm, 0, 40, 2, "mm", (feed_mm) =>
                  change({ feed_mm }),
                )}
              </div>
              <Segmented
                label={t("printer.size")}
                options={[
                  ["small", t("printer.small")],
                  ["medium", t("printer.medium")],
                  ["large", t("printer.large")],
                ]}
                value={p.font_size}
                onChange={(font_size) => change({ font_size })}
              />
              <Segmented
                label={t("printer.bold")}
                options={[
                  ["off", t("printer.normal")],
                  ["on", t("printer.darker")],
                ]}
                value={p.bold ? "on" : "off"}
                onChange={(v) => change({ bold: v === "on" })}
              />
              {p.show_logo &&
                stepper("printer.logo_size", p.logo_percent, 30, 100, 10, "%", (logo_percent) =>
                  change({ logo_percent }),
                )}
            </section>
            <section className="box p-5 grid gap-3 content-start">
              <h2>{t("printer.content")}</h2>
              <Field
                label={t("printer.shop_name")}
                value={draft.receipt_name}
                maxLength={60}
                onChange={(receipt_name) => set({ receipt_name })}
              />
              <Field
                label={t("printer.phone")}
                kind="digits"
                value={draft.receipt_phone}
                maxLength={40}
                onChange={(receipt_phone) => set({ receipt_phone })}
              />
              <Field
                label={t("printer.address")}
                value={draft.receipt_address}
                maxLength={120}
                onChange={(receipt_address) => set({ receipt_address })}
              />
              <Field
                label={t("printer.footer")}
                value={draft.receipt_footer}
                maxLength={160}
                onChange={(receipt_footer) => set({ receipt_footer })}
              />
              <div className="label mt-1">{t("printer.show")}</div>
              <div className="grid grid-cols-2">
                {SHOWN.map(([name, label]) => (
                  <label className="check" key={name}>
                    <input
                      type="checkbox"
                      checked={Boolean(p[name])}
                      onChange={(e) => change({ [name]: e.target.checked })}
                    />
                    {t(label)}
                  </label>
                ))}
              </div>
              <p className="soft text-sm">{t("printer.always")}</p>
            </section>
          </div>
          <div className="preview">
            <iframe
              title={t("printer.preview")}
              srcDoc={html}
              sandbox=""
              style={{ width: `${p.paper}mm` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
