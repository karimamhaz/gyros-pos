import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../shared/api";
import type { Delivery, Order, OrderType, Product } from "../../shared/types";

export interface Line {
  key: number;
  product_id: string;
  name: string;
  price: number;
  qty: number;
  note: string;
}

const emptyDelivery: Delivery = {
  customer: "",
  phone: "",
  address: "",
  driver: "",
  requested_time: "",
  promised_time: "",
};

let nextKey = 1;
const linesOf = (order: Order | null): Line[] =>
  (order?.items ?? [])
    .filter((i) => i.state === "draft")
    .map((i) => ({
      key: nextKey++,
      product_id: i.product_id,
      name: i.name,
      price: i.price,
      qty: i.qty,
      note: i.note,
    }));

interface Content {
  type: OrderType;
  lines: Line[];
  delivery: Delivery;
  fee: number | null;
}

const contentOf = (order: Order | null): Content => ({
  type: order?.type ?? "takeaway",
  lines: linesOf(order),
  delivery: order?.delivery ?? emptyDelivery,
  fee: order?.type === "delivery" ? order.delivery_fee : null,
});

/**
 * What the cashier is building. Every change is saved at once, one request at a time,
 * and the newest content always wins. Totals shown come from the server's answer.
 */
export function useDraft(initial: Order | null) {
  const [order, setOrder] = useState(initial);
  const [content, setContent] = useState(() => contentOf(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const orderRef = useRef(initial);
  const contentRef = useRef(content);
  const dirty = useRef(false);
  const failed = useRef(false);
  const running = useRef<Promise<void> | null>(null);

  const accept = useCallback((next: Order | null) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  /** Takes over an order as the server has it now. */
  const reset = useCallback(
    (next: Order | null) => {
      dirty.current = failed.current = false;
      accept(next);
      contentRef.current = contentOf(next);
      setContent(contentRef.current);
      setError(null);
    },
    [accept],
  );

  const loop = useCallback(async () => {
    setSaving(true);
    let conflicts = 0;
    while (dirty.current) {
      dirty.current = false;
      try {
        const c = contentRef.current;
        if (!orderRef.current) {
          const type = c.type === "delivery" ? "delivery" : "takeaway";
          accept(await api.post<Order>("/orders", { type }));
        }
        const current = orderRef.current!;
        const saved = await api.put<Order>(`/orders/${current.id}`, {
          version: current.version,
          type: c.type,
          items: c.lines.map(({ product_id, qty, note }) => ({ product_id, qty, note })),
          ...(c.type === "delivery" ? { delivery: c.delivery, delivery_fee: c.fee } : {}),
        });
        accept(saved);
        if (saved.type === "delivery" && contentRef.current.fee === null) {
          contentRef.current = { ...contentRef.current, fee: saved.delivery_fee };
          setContent(contentRef.current);
        }
        setError(null);
      } catch (e) {
        const changed = e instanceof ApiError && e.code === "order_changed";
        if (changed && orderRef.current && conflicts++ < 2) {
          const id = orderRef.current.id;
          const latest = await api.get<Order>(`/orders/${id}`).catch(() => null);
          if (latest) {
            accept(latest);
            dirty.current = true;
            continue;
          }
        }
        if (!dirty.current) {
          setError(e);
          failed.current = true;
          break;
        }
      }
    }
    setSaving(false);
  }, [accept]);

  const flush = useCallback(async () => {
    if (failed.current) {
      failed.current = false;
      dirty.current = true; // what could not be saved is sent again
    }
    if (!running.current) {
      running.current = loop().finally(() => {
        running.current = null;
      });
    }
    await running.current;
  }, [loop]);

  const change = useCallback(
    (edit: (c: Content) => Content) => {
      contentRef.current = edit(contentRef.current);
      setContent(contentRef.current);
      dirty.current = true;
      void flush();
    },
    [flush],
  );

  useEffect(() => {
    // Nothing typed may be lost when the screen changes.
    return () => {
      if (dirty.current || failed.current) void flush();
    };
  }, [flush]);

  const add = (p: Product) =>
    change((c) => {
      const same = c.lines.findLast((l) => l.product_id === p.id && !l.note);
      const lines = same
        ? c.lines.map((l) => (l === same ? { ...l, qty: Math.min(l.qty + 1, 999) } : l))
        : [
            ...c.lines,
            {
              key: nextKey++,
              product_id: p.id,
              name: p.name,
              price: p.price_lbp,
              qty: 1,
              note: "",
            },
          ];
      return { ...c, lines };
    });

  const setQty = (key: number, qty: number) =>
    change((c) => ({
      ...c,
      lines:
        qty < 1
          ? c.lines.filter((l) => l.key !== key)
          : c.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(qty, 999) } : l)),
    }));

  const setNote = (key: number, note: string) =>
    change((c) => ({ ...c, lines: c.lines.map((l) => (l.key === key ? { ...l, note } : l)) }));

  return {
    order,
    accept,
    reset,
    ...content,
    saving,
    error,
    /** False while the server's total does not yet match the screen. */
    settled: !saving && !error,
    flush,
    /** Saves again, so unsaved items get today's price and availability. */
    refresh: () => change((c) => ({ ...c })),
    add,
    setQty,
    setNote,
    setType: (type: OrderType) => change((c) => ({ ...c, type })),
    setDelivery: (delivery: Delivery) => change((c) => ({ ...c, delivery })),
    setFee: (fee: number) => change((c) => ({ ...c, fee })),
  };
}

export type Draft = ReturnType<typeof useDraft>;
