import { useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../shared/api";
import { formatTime } from "../../shared/format";
import type { Order } from "../../shared/types";
import { ApprovalDialog } from "../../shared/ApprovalForm";
import { Button, Empty, ErrorNote, Lbp, Ltr, Table } from "../../shared/ui";
import { RefundDialog } from "../find/RefundDialog";
import { PaymentScreen } from "../payment/PaymentScreen";

interface Props {
  orders: Order[] | null;
  error: unknown;
  reload: () => Promise<void>;
}

export function UnpaidDeliveries({ orders, error, reload }: Props) {
  const { t } = useI18n();
  const [paying, setPaying] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);

  const finish = () => {
    setPaying(null);
    setCancelling(null);
    void reload();
  };
  if (paying) return <PaymentScreen order={paying} onBack={finish} onDone={finish} />;
  return (
    <main className="page">
      <h1>{t("deliveries.title")}</h1>
      <ErrorNote error={error} />
      {orders?.length === 0 && <Empty>{t("deliveries.none")}</Empty>}
      {!!orders?.length && (
        <Table
          head={[
            t("number"),
            t("delivery.customer"),
            t("delivery.phone"),
            t("delivery.address"),
            t("delivery.driver"),
            t("deliveries.left_at"),
            t("deliveries.owes"),
            "",
          ]}
        >
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <b>{o.number}</b>
              </td>
              <td>
                <bdi>{o.delivery?.customer}</bdi>
              </td>
              <td>
                <Ltr>{o.delivery?.phone}</Ltr>
              </td>
              <td>
                <bdi>{o.delivery?.address}</bdi>
              </td>
              <td>
                <bdi>{o.delivery?.driver}</bdi>
              </td>
              <td>{o.confirmed_at && <Ltr>{formatTime(o.confirmed_at)}</Ltr>}</td>
              <td>
                <b className="text-brand">
                  <Lbp value={o.due} />
                </b>
              </td>
              <td>
                <div className="flex gap-2 justify-end">
                  <Button variant="dark" onClick={() => setPaying(o)}>
                    {t("deliveries.collect")}
                  </Button>
                  <Button variant="danger" onClick={() => setCancelling(o)}>
                    {t(o.paid ? "refund" : "cancel")}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {cancelling && cancelling.paid > 0 && (
        <RefundDialog order={cancelling} code="" onClose={finish} onDone={finish} />
      )}
      {cancelling && cancelling.paid === 0 && (
        <ApprovalDialog
          title={t("order.cancel_saved")}
          onClose={finish}
          onApprove={async (approval) => {
            const body = { version: cancelling.version, approval };
            await api.post(`/orders/${cancelling.id}/cancel`, body);
            finish();
          }}
        >
          <p>{t("order.number", { number: cancelling.number })}</p>
        </ApprovalDialog>
      )}
    </main>
  );
}
