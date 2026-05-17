import { toast } from "sonner";

const BASE = (import.meta as any).env?.VITE_API_BASE_URL || "";

const TOKEN_KEY = "lgw_jwt";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type ReqOpts = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  rawBody?: boolean;
  silent?: boolean;
  signal?: AbortSignal;
};

export async function api<T = any>(path: string, opts: ReqOpts = {}): Promise<T> {
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
    init.body = opts.rawBody ? opts.body : JSON.stringify(opts.body);
  }
  const resp = await fetch(`${BASE}${path}`, init);

  if (resp.status === 401 && path.startsWith("/api/")) {
    setToken(null);
    if (location.pathname !== "/login") {
      location.assign("/login");
    }
    throw new ApiError(401, null, "Unauthorized");
  }

  let parsed: any = null;
  const text = await resp.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!resp.ok) {
    const message =
      (parsed && typeof parsed === "object" && (parsed.detail || parsed.message)) ||
      (typeof parsed === "string" ? parsed : `Request failed (${resp.status})`);
    const msg = typeof message === "object" ? JSON.stringify(message) : String(message);
    if (!opts.silent) toast.error(msg.slice(0, 300));
    throw new ApiError(resp.status, parsed, msg);
  }
  return parsed as T;
}

/* Gateway API call using a USER api key (lgw_...). For Playground. */
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
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const respHeaders: Record<string, string> = {};
  resp.headers.forEach((v, k) => (respHeaders[k] = v));
  return { status: resp.status, body, headers: respHeaders };
}

/* Streaming Server-Sent Events call. Yields each `data:` chunk parsed JSON. */
export async function* gatewayStream(
  path: string,
  apiKey: string,
  body: any,
  signal?: AbortSignal,
): AsyncGenerator<{ raw: string; parsed: any | null }, void, void> {
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
