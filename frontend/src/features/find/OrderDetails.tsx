import { useI18n } from "../../i18n";
import type { Order } from "../../shared/types";
import { Lbp, Line, Tag } from "../../shared/ui";
import { Totals } from "../order/Ticket";

const TONE = { paid: "good", unpaid: "bad", partial: "warn", refunded: "" } as const;

export function OrderDetails({ order }: { order: Order }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2">
      <div className="line">
        <h2>
          {t("order.number", { number: order.number })}، {t(`type.${order.type}`)}
          {order.table_no ? ` ${order.table_no}` : ""}
        </h2>
        <Tag tone={order.state === "cancelled" ? "" : TONE[order.payment_state]}>
          {t(order.state === "cancelled" ? "state.cancelled" : `state.${order.payment_state}`)}
        </Tag>
      </div>
      {order.delivery && order.type === "delivery" && (
        <p className="soft">
          <bdi>{order.delivery.customer}</bdi>، <bdi dir="ltr">{order.delivery.phone}</bdi>،{" "}
          <bdi>{order.delivery.address}</bdi>
        </p>
      )}
      {order.items.map((i) => (
        <div key={i.id} className={i.state === "voided" ? "line-through opacity-50" : ""}>
          <Line
            label={
              <>
                {i.qty}× <bdi>{i.name}</bdi>
                {i.note && (
                  <span className="note">
                    {" "}
                    <bdi>{i.note}</bdi>
                  </span>
                )}
              </>
            }
          >
            <Lbp value={i.line_total} />
          </Line>
        </div>
      ))}
      <div className="border-t-2 pt-2">
        <Totals order={order} />
        {order.paid_wish > 0 && (
          <Line label={t("paid.by_wish_amount")}>
            <Lbp value={order.paid_wish} />
          </Line>
        )}
      </div>
    </div>
  );
}
