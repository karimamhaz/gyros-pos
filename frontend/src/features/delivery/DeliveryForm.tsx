import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { Delivery } from "../../shared/types";
import { AmountField, Button, Field, useLoad } from "../../shared/ui";
import type { Draft } from "../order/useDraft";

export function DeliveryForm({ draft, onBack }: { draft: Draft; onBack: () => void }) {
  const { t } = useI18n();
  const drivers = useLoad(() => api.get<string[]>("/orders/drivers"));
  const d = draft.delivery;
  const set = (part: Partial<Delivery>) => draft.setDelivery({ ...d, ...part });

  return (
    <div className="grid gap-4 content-start scroll p-1">
      <div className="line">
        <h1>{t("delivery.details")}</h1>
        <Button onClick={onBack}>{t("delivery.to_products")}</Button>
      </div>
      <div className="box p-5 grid grid-cols-2 gap-4">
        <Field
          label={t("delivery.customer")}
          value={d.customer}
          maxLength={60}
          onChange={(customer) => set({ customer })}
        />
        <Field
          label={t("delivery.phone")}
          kind="digits"
          value={d.phone}
          maxLength={60}
          onChange={(phone) => set({ phone })}
        />
        <div className="col-span-2">
          <Field
            label={t("delivery.address")}
            multiline
            value={d.address}
            maxLength={250}
            onChange={(address) => set({ address })}
          />
        </div>
        <AmountField
          label={t("delivery.fee")}
          currency="LBP"
          value={draft.fee ?? 0}
          onChange={draft.setFee}
        />
        <div>
          <Field
            label={t("delivery.driver")}
            value={d.driver}
            maxLength={60}
            onChange={(driver) => set({ driver })}
          />
          {!!drivers.data?.length && (
            <div className="flex gap-2 flex-wrap mt-2">
              {drivers.data.slice(0, 6).map((name) => (
                <Button
                  size="s"
                  key={name}
                  variant={d.driver === name ? "dark" : "plain"}
                  onClick={() => set({ driver: name })}
                >
                  <bdi>{name}</bdi>
                </Button>
              ))}
            </div>
          )}
        </div>
        <Field
          label={t("delivery.requested")}
          value={d.requested_time}
          maxLength={60}
          onChange={(requested_time) => set({ requested_time })}
        />
        <Field
          label={t("delivery.promised")}
          value={d.promised_time}
          maxLength={60}
          onChange={(promised_time) => set({ promised_time })}
        />
      </div>
    </div>
  );
}
