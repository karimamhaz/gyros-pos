import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../../shared/api";
import type { Order, Product } from "../../shared/types";
import { useDraft } from "./useDraft";

vi.mock("../../shared/api", async (original) => ({
  ...(await original<typeof import("../../shared/api")>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const order = (version: number, over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    type: "takeaway",
    state: "draft",
    version,
    items: [],
    total: 0,
    ...over,
  }) as unknown as Order;
const product = (id: string, name = id): Product => ({
  id,
  name,
  category_id: "c",
  price_lbp: 1000,
  available: true,
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let version: number;
let bodies: { version: number; items: { product_id: string; qty: number }[] }[];
beforeEach(() => {
  version = 1;
  bodies = [];
  vi.mocked(api.post).mockResolvedValue(order(1));
  vi.mocked(api.put).mockImplementation(async (_path, body) => {
    await sleep(15);
    bodies.push(body as (typeof bodies)[number]);
    version += 1;
    return order(version);
  });
});

describe("order autosave", () => {
  test("quick taps are saved one request at a time and the last content wins", async () => {
    const { result } = renderHook(() => useDraft(null));
    act(() => {
      for (const id of ["a", "a", "b", "a"]) result.current.add(product(id));
    });
    await act(() => result.current.flush());
    const last = bodies.at(-1)!;
    expect(last.items.map((i) => [i.product_id, i.qty])).toEqual([
      ["a", 3],
      ["b", 1],
    ]);
    expect(bodies.map((b) => b.version)).toEqual(bodies.map((_, n) => n + 1)); // never two at once
    expect(result.current.settled).toBe(true);
  });

  test("a note keeps its own line and the quantity can go down to removal", async () => {
    const { result } = renderHook(() => useDraft(null));
    act(() => result.current.add(product("a")));
    await act(() => result.current.flush());
    const key = result.current.lines[0].key;
    act(() => result.current.setNote(key, "no onions"));
    act(() => result.current.add(product("a"))); // a line with a note is not merged
    expect(result.current.lines.map((l) => [l.qty, l.note])).toEqual([
      [1, "no onions"],
      [1, ""],
    ]);
    act(() => result.current.setQty(key, 0));
    expect(result.current.lines).toHaveLength(1);
    await act(() => result.current.flush());
  });

  test("when the order changed elsewhere it reloads and sends the newest content again", async () => {
    const { result } = renderHook(() => useDraft(order(1)));
    let first = true;
    vi.mocked(api.put).mockImplementation(async (_p, body) => {
      if (first) {
        first = false;
        throw new ApiError("order_changed", 409);
      }
      bodies.push(body as (typeof bodies)[number]);
      return order(9);
    });
    vi.mocked(api.get).mockResolvedValue(order(8));
    act(() => result.current.add(product("a")));
    await act(() => result.current.flush());
    expect(bodies).toHaveLength(1);
    expect(bodies[0].version).toBe(8);
    expect(result.current.error).toBeNull();
  });

  test("a failed save keeps what was typed and tries again on request", async () => {
    const { result } = renderHook(() => useDraft(order(1)));
    vi.mocked(api.put).mockRejectedValueOnce(new ApiError("no_connection", 0));
    act(() => result.current.add(product("a")));
    await act(() => result.current.flush());
    expect(result.current.error).toMatchObject({ code: "no_connection" });
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.settled).toBe(false);
    await act(() => result.current.flush());
    expect(result.current.error).toBeNull();
    expect(bodies.at(-1)!.items).toHaveLength(1);
  });

  test("switching to delivery saves the fee and details; going back drops them", async () => {
    const { result } = renderHook(() => useDraft(null));
    act(() => result.current.add(product("a")));
    act(() => result.current.setType("delivery"));
    await act(() => result.current.flush());
    expect(vi.mocked(api.put).mock.calls.at(-1)![1]).toHaveProperty("delivery");
    act(() => result.current.setType("takeaway"));
    await act(() => result.current.flush());
    expect(vi.mocked(api.put).mock.calls.at(-1)![1]).not.toHaveProperty("delivery");
  });
});
