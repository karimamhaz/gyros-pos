import { useState } from "react";
import { useI18n, type Lang } from "../../i18n";
import { api } from "../../shared/api";
import { parseInteger } from "../../shared/format";
import type { CountMode } from "../../shared/types";
import {
  AmountField,
  Button,
  ChoiceField,
  Dialog,
  ErrorNote,
  Field,
  Segmented,
  useAction,
} from "../../shared/ui";
import { Head } from "./Head";
import { useSettingsForm } from "./useSettingsForm";

const HOURS = Array.from({ length: 12 }, (_, h): [string, string] => [
  String(h * 60),
  `${String(h).padStart(2, "0")}:00`,
]);

export function SettingsPage() {
  const { t, setLang } = useI18n();
  const { draft, set, save, saved, busy, error } = useSettingsForm();
  const [password, setPassword] = useState(false);
  const toggle = (label: string, on: boolean, change: (on: boolean) => void) => (
    <Segmented
      label={label}
      options={[
        ["on", t("on")],
        ["off", t("off")],
      ]}
      value={on ? "on" : "off"}
      onChange={(v) => change(v === "on")}
    />
  );

  return (
    <>
      <Head title={t("admin.settings")}>
        {saved && <div className="status good">{t("saved")}</div>}
        <Button
          variant="primary"
          disabled={busy || !draft.rate}
          onClick={() => {
            setLang(draft.language);
            void save();
          }}
        >
          {t("settings.save")}
        </Button>
      </Head>
      <ErrorNote error={error} />
      <div className="auto-cols scroll">
        <section className="box p-5 grid gap-3.5">
          <h2>{t("settings.selling")}</h2>
          <AmountField
            label={t("rate.one_usd")}
            currency="LBP"
            value={draft.rate ?? 0}
            onChange={(rate) => set({ rate })}
          />
          <p className="soft text-sm">{t("rate.hint")}</p>
          <AmountField
            label={t("settings.fee")}
            currency="LBP"
            value={draft.default_delivery_fee}
            onChange={(default_delivery_fee) => set({ default_delivery_fee })}
          />
          <Field
            label={t("settings.tables")}
            kind="digits"
            value={String(draft.table_count)}
            maxLength={3}
            onChange={(text) => set({ table_count: Math.min(parseInteger(text), 200) })}
          />
          <ChoiceField
            label={t("settings.day_end")}
            value={String(draft.day_cutoff_minutes)}
            options={HOURS}
            onChange={(v) => set({ day_cutoff_minutes: Number(v) })}
          />
        </section>
        <section className="box p-5 grid gap-3.5">
          <h2>{t("settings.shift")}</h2>
          <div>
            <div className="label">{t("settings.count")}</div>
            <div className="grid gap-1.5">
              {(["totals", "banknotes", "closing_only"] as CountMode[]).map((mode) => (
                <Button
                  key={mode}
                  variant={draft.count_mode === mode ? "dark" : "plain"}
                  aria-pressed={draft.count_mode === mode}
                  onClick={() => set({ count_mode: mode })}
                >
                  {t(`settings.count.${mode}`)}
                </Button>
              ))}
            </div>
          </div>
          {draft.count_mode === "closing_only" && (
            <>
              <AmountField
                label={t("settings.opening_usd")}
                currency="USD"
                value={draft.fixed_opening_usd}
                onChange={(fixed_opening_usd) => set({ fixed_opening_usd })}
              />
              <AmountField
                label={t("settings.opening_lbp")}
                currency="LBP"
                value={draft.fixed_opening_lbp}
                onChange={(fixed_opening_lbp) => set({ fixed_opening_lbp })}
              />
            </>
          )}
          <Segmented<Lang>
            label={t("settings.language")}
            options={[
              ["ar", "العربية"],
              ["en", "English"],
            ]}
            value={draft.language}
            onChange={(language) => set({ language })}
          />
        </section>
        <section className="box p-5 grid gap-3.5">
          <h2>{t("settings.modules")}</h2>
          {toggle(t("admin.inventory"), draft.inventory_enabled, (inventory_enabled) =>
            set({ inventory_enabled }),
          )}
          {toggle(t("admin.expenses"), draft.expenses_enabled, (expenses_enabled) =>
            set({ expenses_enabled }),
          )}
          <h2 className="mt-2">{t("settings.security")}</h2>
          <Button onClick={() => setPassword(true)}>{t("settings.password")}</Button>
        </section>
      </div>
      {password && <PasswordDialog onClose={() => setPassword(false)} />}
    </>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const { busy, error, run } = useAction();
  const field = (label: string, value: string, change: (v: string) => void) => (
    <Field label={label} kind="latin" password value={value} onChange={change} maxLength={100} />
  );
  return (
    <Dialog title={t("settings.password")} onClose={onClose}>
      {field(t("password.own"), current, setCurrent)}
      {field(t("setup.password"), password, setPassword)}
      {field(t("password.again"), again, setAgain)}
      {again !== "" && again !== password && (
        <div className="error-note">{t("password.mismatch")}</div>
      )}
      <ErrorNote error={error} />
      <div className="flex gap-3">
        <Button onClick={onClose}>{t("back")}</Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || !current || password.length < 8 || again !== password}
          onClick={() =>
            run(async () => {
              await api.put("/auth/password", { current, password });
              onClose();
            })
          }
        >
          {t("save")}
        </Button>
      </div>
    </Dialog>
  );
}
