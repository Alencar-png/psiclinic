/**
 * Cliente HTTP — anexa Bearer e faz refresh automático em 401.
 *
 * Estado mínimo: tokens em localStorage (dev). Em prod, considere mover
 * o refresh para httpOnly cookie + endpoint /auth/refresh proxy no Next.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4200/api";

const ACCESS_KEY = "psiclinic.access";
const REFRESH_KEY = "psiclinic.refresh";

export const tokenStore = {
  get access() { return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY); },
  get refresh() { return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY); },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(typeof body === "string" ? body : body?.detail ?? "API error");
    this.status = status;
    this.body = body;
  }
}

async function refreshTokens(): Promise<boolean> {
  const refresh = tokenStore.refresh;
  if (!refresh) return false;
  const r = await fetch(`${API}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!r.ok) { tokenStore.clear(); return false; }
  const data = await r.json();
  tokenStore.set(data.access_token, data.refresh_token);
  return true;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api<T = unknown>(
  path: string,
  opts: { method?: Method; body?: unknown; query?: Record<string, any> } = {},
): Promise<T> {
  const url = new URL(`${API}${path}`);
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const doFetch = async (): Promise<Response> => {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (tokenStore.access) headers["Authorization"] = `Bearer ${tokenStore.access}`;
    return fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && tokenStore.refresh) {
    const ok = await refreshTokens();
    if (ok) res = await doFetch();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export { ApiError };
