import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError, setToken, whenSessionLost } from "./api";

const reply = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

beforeEach(() => {
  setToken(null);
  whenSessionLost(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  test("sends the session token and the body, and returns the answer", async () => {
    const fetch = vi.fn(() => reply(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetch);
    setToken("abc");
    expect(await api.post("/orders", { type: "takeaway" })).toEqual({ ok: 1 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orders");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
    expect(init.body).toBe('{"type":"takeaway"}');
  });

  test("sends nothing secret before login", async () => {
    const fetch = vi.fn(() => reply(200, {}));
    vi.stubGlobal("fetch", fetch);
    await api.get("/auth/start");
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  test("turns an error answer into a code the screens can translate", async () => {
    vi.stubGlobal("fetch", () =>
      reply(409, { error: { code: "promo_expired", params: { a: 1 } } }),
    );
    const error = await api.get("/x").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "promo_expired", status: 409, params: { a: 1 } });
  });

  test("an answer that is not JSON still gives a clear error", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html>", { status: 502 })));
    expect(await api.get("/x").catch((e) => e)).toMatchObject({
      code: "internal_error",
      status: 502,
    });
  });

  test("no answer at all is reported as no connection", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("failed")));
    expect(await api.get("/x").catch((e) => e)).toMatchObject({ code: "no_connection", status: 0 });
  });

  test("an ended session sends the person back to the start", async () => {
    const lost = vi.fn();
    whenSessionLost(lost);
    vi.stubGlobal("fetch", () => reply(401, { error: { code: "session_ended", params: {} } }));
    await api.get("/x").catch(() => {});
    expect(lost).toHaveBeenCalledOnce();
    vi.stubGlobal("fetch", () => reply(401, { error: { code: "unauthorized", params: {} } }));
    await api.get("/x").catch(() => {});
    expect(lost).toHaveBeenCalledOnce();
  });
});
