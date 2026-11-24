import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { Order } from "../../shared/types";
import { Button, ErrorNote, Field, Ltr, Tag, useAction } from "../../shared/ui";

export function PromoField({
  order,
  disabled,
  onChange,
}: {
  order: Order | null;
  disabled: boolean;
  onChange: (order: Order) => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const { busy, error, run, clear } = useAction();
  if (!order || order.paid > 0) return null;

  const send = (value: string) =>
    run(async () => {
      const body = { version: order.version, code: value };
      onChange(await api.put<Order>(`/orders/${order.id}/promo`, body));
      setCode("");
    });

  return (
    <div className="grid grid-cols-1 gap-2">
      {order.promo ? (
        <div className="line">
          <Tag tone="good">
            <Ltr>{`${order.promo.code} ${order.promo.percent}%`}</Ltr>
          </Tag>
          <Button size="s" disabled={busy || disabled} onClick={() => send("")}>
            {t("promo.remove")}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 bare">
          <div className="flex-1">
            <Field
              label={t("promo")}
              placeholder={t("promo")}
              kind="latin"
              value={code}
              maxLength={20}
              onChange={(text) => {
                clear();
                setCode(text.toUpperCase());
              }}
              onEnter={() => code.trim() && send(code)}
            />
          </div>
          <Button disabled={busy || disabled || !code.trim()} onClick={() => send(code)}>
            {t("promo.apply")}
          </Button>
        </div>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
