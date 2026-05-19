import { toast } from "sonner";
import type {
  OAuthIdentity,
  OAuthProvidersStatus,
  PasswordChangeResponse,
  User,
} from "./types";

const BASE = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_BASE_URL || "";

const TOKEN_KEY = "lgw_jwt";
const REFRESH_KEY = "lgw_refresh";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setRefreshToken(t: string | null) {
  if (t) localStorage.setItem(REFRESH_KEY, t);
  else localStorage.removeItem(REFRESH_KEY);
}
export function clearAuth() {
  setToken(null);
  setRefreshToken(null);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type ReqOpts = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  rawBody?: boolean;
  silent?: boolean;
  signal?: AbortSignal;
  _retried?: boolean;
};

/** Extract the canonical user-facing error message from any of our error shapes. */
function extractErrorMessage(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (obj.error && typeof obj.error === "object") {
      const inner = obj.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
    if (typeof obj.detail === "string") return obj.detail;
    if (typeof obj.message === "string") return obj.message;
  }
  if (typeof parsed === "string" && parsed) return parsed;
  return `Request failed (${status})`;
}

let refreshing: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  const refresh = getRefreshToken();
  if (!refresh) return false;
  refreshing = (async () => {
    try {
      const resp = await fetch(`${BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!resp.ok) {
        clearAuth();
        return false;
      }
      const data = (await resp.json()) as { access_token: string; refresh_token: string };
      setToken(data.access_token);
      setRefreshToken(data.refresh_token);
      return true;
    } catch {
      clearAuth();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  const token = getToken();
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const init: RequestInit = {
    method: opts.method || "GET",
    headers,
    signal: opts.signal,
  };
  if (opts.body !== undefined) {
    init.body = opts.rawBody ? (opts.body as BodyInit) : JSON.stringify(opts.body);
  }
  const resp = await fetch(`${BASE}${path}`, init);

  // 401 on /api/* → try a refresh, then retry once.
  if (resp.status === 401 && path.startsWith("/api/") && !opts._retried) {
    if (path !== "/api/auth/refresh") {
      const ok = await attemptRefresh();
      if (ok) {
        return api<T>(path, { ...opts, _retried: true });
      }
    }
    clearAuth();
    if (location.pathname !== "/login") {
      location.assign("/login");
    }
    throw new ApiError(401, null, "Unauthorized");
  }

  let parsed: unknown = null;
  const text = await resp.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!resp.ok) {
    const msg = extractErrorMessage(parsed, resp.status);
    if (!opts.silent) toast.error(msg.slice(0, 300));
    throw new ApiError(resp.status, parsed, msg);
  }
  return parsed as T;
}

/** Generic upstream/gateway response body shape — Playground treats it as
 * an opaque JSON record because the Anthropic/OpenAI/task envelopes differ. */
export type GatewayBody = Record<string, unknown> | unknown[] | string | null;

/* Gateway API call using a USER api key (sk-...). For Playground. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gateway(
  path: string,
  apiKey: string,
  opts: ReqOpts = {},
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(opts.headers || {}),
  };
  const init: RequestInit = {
    method: opts.method || "GET",
    headers,
    signal: opts.signal,
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const resp = await fetch(`${BASE}${path}`, init);
  const text = await resp.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const respHeaders: Record<string, string> = {};
  resp.headers.forEach((v, k) => (respHeaders[k] = v));
  return { status: resp.status, body, headers: respHeaders };
}

/* Streaming Server-Sent Events call. Yields each `data:` chunk parsed JSON.
   `parsed` is typed loosely because callers consume vendor-specific fields. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function* gatewayStream(
  path: string,
  apiKey: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<{ raw: string; parsed: any }, void, void> {
  const resp = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text();
    throw new Error(t || `HTTP ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const evt = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of evt.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") {
          yield { raw: data, parsed: null };
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = null;
        }
        yield { raw: data, parsed };
      }
    }
  }
}

// ---- OAuth ----

export async function getOAuthProviders(): Promise<OAuthProvidersStatus> {
  return api<OAuthProvidersStatus>("/api/auth/oauth/providers", { silent: true });
}

export function startOAuthLogin(
  provider: "google" | "github",
  returnTo: string = "/dashboard",
): void {
  const qs = new URLSearchParams({ return_to: returnTo });
  window.location.assign(`${BASE}/api/auth/oauth/${provider}/start?${qs.toString()}`);
}

export async function startOAuthLink(
  provider: "google" | "github",
  returnTo: string = "/settings/connections",
): Promise<void> {
  const resp = await api<{ redirect_url: string }>(
    `/api/auth/oauth/${provider}/link/start`,
    { method: "POST", body: { return_to: returnTo } },
  );
  window.location.assign(resp.redirect_url);
}

export async function exchangeOAuth(): Promise<{
  access_token: string;
  refresh_token: string;
  user: User;
}> {
  const res = await fetch(`${BASE}/api/auth/oauth/exchange`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new ApiError(res.status, txt, `Exchange failed (${res.status})`);
  }
  return res.json();
}

// ---- Settings: connections ----

export async function listConnections(): Promise<OAuthIdentity[]> {
  return api<OAuthIdentity[]>("/api/settings/connections");
}

export async function detachConnection(identityId: number): Promise<void> {
  await api(`/api/settings/connections/${identityId}`, { method: "DELETE", silent: true });
}

// ---- Settings: password ----

export async function setOrChangePassword(
  currentPassword: string | null,
  newPassword: string,
): Promise<PasswordChangeResponse> {
  return api<PasswordChangeResponse>("/api/auth/me/password", {
    method: "POST",
    body: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  });
}

// ---- Admin: mark email verified ----

export async function adminMarkEmailVerified(userId: number): Promise<void> {
  await api(`/api/admin/users/${userId}/mark-email-verified`, { method: "POST" });
}
