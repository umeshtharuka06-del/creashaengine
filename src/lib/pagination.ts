/**
 * Shared pagination helpers for list/history endpoints.
 * Keeps page math + clamping in one place so every endpoint behaves the same.
 */

export interface PageParams {
  page: number; // 1-based
  pageSize: number;
  skip: number;
}

const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;

export function parsePage(sp: URLSearchParams): PageParams {
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const rawSize = Number(sp.get("pageSize")) || DEFAULT_SIZE;
  const pageSize = Math.min(MAX_SIZE, Math.max(1, rawSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function pageMeta(p: PageParams, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return {
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages,
    hasPrev: p.page > 1,
    hasNext: p.page < totalPages,
  };
}
