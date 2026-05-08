/**
 * Cliente HTTP — anexa Bearer e faz refresh automático em 401.
 *
 * Estado mínimo: tokens em localStorage (dev). Em prod, considere mover
 * o refresh para httpOnly cookie + endpoint /auth/refresh proxy no Next.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4200/api";

const ACCESS_KEY = "psiclinic.access";
const REFRESH_KEY = "psiclinic.refresh";
// Backup p/ impersonação: quando super_admin "acessa como" admin de uma empresa,
// guardamos o token original do super_admin aqui pra poder voltar depois.
const ORIGINAL_ACCESS_KEY = "psiclinic.original.access";
const ORIGINAL_REFRESH_KEY = "psiclinic.original.refresh";

export const tokenStore = {
  get access() { return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY); },
  get refresh() { return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY); },
  /** True se a sessão atual é uma impersonação (há um token original guardado). */
  get isImpersonating() {
    return typeof window !== "undefined" && !!localStorage.getItem(ORIGINAL_ACCESS_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  /** Inicia impersonação: guarda token atual e ativa o novo. */
  startImpersonation(newAccess: string) {
    const curAccess = localStorage.getItem(ACCESS_KEY);
    const curRefresh = localStorage.getItem(REFRESH_KEY);
    if (curAccess) localStorage.setItem(ORIGINAL_ACCESS_KEY, curAccess);
    if (curRefresh) localStorage.setItem(ORIGINAL_REFRESH_KEY, curRefresh);
    localStorage.setItem(ACCESS_KEY, newAccess);
    // Token impersonado não tem refresh — limpa pra api.ts não tentar usar.
    localStorage.removeItem(REFRESH_KEY);
  },
  /** Finaliza impersonação restaurando o token original. */
  stopImpersonation() {
    const origAccess = localStorage.getItem(ORIGINAL_ACCESS_KEY);
    const origRefresh = localStorage.getItem(ORIGINAL_REFRESH_KEY);
    if (origAccess) localStorage.setItem(ACCESS_KEY, origAccess); else localStorage.removeItem(ACCESS_KEY);
    if (origRefresh) localStorage.setItem(REFRESH_KEY, origRefresh); else localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ORIGINAL_ACCESS_KEY);
    localStorage.removeItem(ORIGINAL_REFRESH_KEY);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ORIGINAL_ACCESS_KEY);
    localStorage.removeItem(ORIGINAL_REFRESH_KEY);
  },
};

class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(formatApiError(body));
    this.status = status;
    this.body = body;
  }
}

/**
 * Converte qualquer formato de erro do backend numa string legível.
 * - 422 do FastAPI vem como { detail: [{loc, msg, type}, ...] } — junta com "; "
 * - 4xx custom vem como { detail: "mensagem" } — usa direto
 * - 5xx às vezes vem como { detail: {message, ...} } — extrai .message
 * - Fallback: JSON.stringify resumido
 */
function formatApiError(body: any): string {
  if (typeof body === "string") return body;
  if (!body) return "Erro de comunicação com o servidor";
  const d = body.detail ?? body;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    // Pydantic validation errors
    return d
      .map((e: any) => {
        const field = Array.isArray(e?.loc)
          ? e.loc.filter((x: any) => x !== "body").join(".")
          : null;
        return field ? `${field}: ${e.msg ?? "inválido"}` : (e.msg ?? "inválido");
      })
      .join("; ");
  }
  if (typeof d === "object") {
    if (typeof d.message === "string") return d.message;
    try { return JSON.stringify(d); } catch { /* ignore */ }
  }
  return "Erro inesperado do servidor";
}

async function refreshTokens(): Promise<boolean> {
  const refresh = tokenStore.refresh;
  if (!refresh) return false;
  // Sessão impersonada não rotaciona — quando expira, front volta ao super_admin.
  if (tokenStore.isImpersonating) return false;
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
  // API pode ser absoluto ("http://localhost:4200/api" em dev) OU relativo
  // ("/api" em prod, mesmo domínio). Quando relativo, URL() exige uma base —
  // usamos a origin da página atual no browser, ou um placeholder no SSR
  // (que nunca chega a usar essa URL para fazer fetch real).
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(`${API}${path}`, base);
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
