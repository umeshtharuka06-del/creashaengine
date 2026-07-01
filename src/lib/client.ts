"use client";

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<ApiResult<T>> {
  const opts: RequestInit = { ...init, headers: { ...(init?.headers || {}) } };
  if (init?.json !== undefined) {
    opts.method = init.method || "POST";
    opts.body = JSON.stringify(init.json);
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  try {
    const res = await fetch(path, { cache: "no-store", ...opts });
    const body = (await res.json().catch(() => ({}))) as ApiResult<T>;
    return body;
  } catch {
    return { ok: false, error: "Network error" };
  }
}
