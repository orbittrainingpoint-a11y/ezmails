import { useAuth } from "@/stores/auth";

const BASE = "/api/v1";

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorShape;
  warning?: string | null;
}

let refreshing: Promise<boolean> | null = null;

/** Attempt to mint a new access token from the refresh cookie (deduped). */
async function refreshAccessToken(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
      if (!res.ok) return false;
      const body = (await res.json()) as Envelope<{ accessToken: string }>;
      if (body.data?.accessToken) {
        useAuth.getState().setAccessToken(body.data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      // Allow a fresh attempt next time.
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Internal: prevents infinite refresh loops. */
  _retried?: boolean;
}

/** Typed fetch wrapper: attaches the access token, refreshes on 401, unwraps the envelope. */
export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, _retried, headers, ...rest } = opts;
  const token = useAuth.getState().accessToken;

  const hasBody = body !== undefined;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      // Only send JSON content-type with an actual body, else Fastify 400s a
      // bodyless POST (FST_ERR_CTP_EMPTY_JSON_BODY) — e.g. /auth/refresh, logout.
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !_retried && path !== "/auth/login" && path !== "/auth/refresh") {
    if (await refreshAccessToken()) return api<T>(path, { ...opts, _retried: true });
    useAuth.getState().clear();
  }

  // Non-JSON responses (e.g. CSV export) — return raw text.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) throw new ApiError(res.status, "HTTP_ERROR", res.statusText);
    return (await res.text()) as unknown as T;
  }

  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || !json.success) {
    const err = json.error;
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? "Request failed", err?.details);
  }
  return json.data as T;
}
