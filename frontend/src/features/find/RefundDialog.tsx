import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import type { Order } from "../../shared/types";
import { ApprovalDialog } from "../../shared/ApprovalForm";
import { AmountField, Button, ErrorNote, Lbp, Line, useLoad } from "../../shared/ui";

interface Quote {
  amount: number;
  usd_cents: number;
  lbp: number;
  rounding: number;
  most_usd_cents: number;
}

interface Props {
  order: Order;
  code: string;
  onClose: () => void;
  onDone: (order: Order) => void;
}

export function RefundDialog({ order, code, onClose, onDone }: Props) {
  const { t } = useI18n();
  const [usd, setUsd] = useState(0);
  const [key] = useState(() => crypto.randomUUID());
  const quote = useLoad(
    () => api.post<Quote>(`/orders/${order.id}/refund-quote`, { code, usd_cents: usd }),
    String(usd),
  );
  const q = quote.data;
  const fresh = q !== null && q.usd_cents === usd && !quote.error;

  return (
    <ApprovalDialog
      title={t("refund")}
      disabled={!fresh}
      onClose={onClose}
      onApprove={async (approval) => {
        const body = { idempotency_key: key, code, usd_cents: usd, lbp: q!.lbp, approval };
        onDone(await api.post<Order>(`/orders/${order.id}/refund`, body));
      }}
    >
      {q && (
        <>
          <Line label={t("refund.amount")}>
            <b>
              <Lbp value={q.amount} />
            </b>
          </Line>
          <div className="grid grid-cols-2 gap-3 items-end">
            <AmountField label={t("pay.give_usd")} currency="USD" value={usd} onChange={setUsd} />
            <div>
              <div className="label">{t("pay.give_lbp")}</div>
              <div className="text-[22px] font-bold">
                <Lbp value={q.lbp} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="s" onClick={() => setUsd(0)}>
              {t("pay.change.lbp")}
            </Button>
            <Button size="s" onClick={() => setUsd(q.most_usd_cents)}>
              {t("pay.change.usd")}
            </Button>
          </div>
        </>
      )}
      <ErrorNote error={quote.error} />
    </ApprovalDialog>
  );
}
