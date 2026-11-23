export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public params: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

let token: string | null = null;
let onSessionLost: () => void = () => {};

/** Kept in memory only, so closing the app always ends the login. */
export const setToken = (value: string | null) => {
  token = value;
};
export const whenSessionLost = (handler: () => void) => {
  onSessionLost = handler;
};

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("no_connection", 0);
  }
  if (response.ok) return response;
  const error = (await response.json().catch(() => null))?.error;
  if (response.status === 401 && error?.code === "session_ended") onSessionLost();
  throw new ApiError(error?.code ?? "internal_error", response.status, error?.params);
}

const json = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
  (await send(method, path, body)).json();

export const api = {
  get: <T>(path: string) => json<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => json<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => json<T>("PUT", path, body),
  delete: <T>(path: string) => json<T>("DELETE", path),
  blob: async (path: string) => (await send("GET", path)).blob(),
};
