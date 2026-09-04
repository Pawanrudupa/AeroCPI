/**
 * AeroCPI typed API client.
 * All gated endpoints require a valid JWT Bearer token.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ------------------------------------------------------------------ */
/*  Generic fetch helper                                               */
/* ------------------------------------------------------------------ */

export async function apiFetch<T = unknown>(
  endpoint: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API ${res.status}: ${res.statusText}${body ? ` — ${body}` : ""}`,
    );
  }

  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Response types (matching backend Pydantic models)                  */
/* ------------------------------------------------------------------ */

export interface HealthResponse {
  status: string;
  service: string;
  system_time: string;
  version: string;
  index_method: string;
  basket_size: number;
  supported_windows: string[];
}

export interface IndexDailyRecord {
  id: number;
  date: string;
  index_value: number;
  method: string;
  base_period: string;
  sample_size: number;
  has_seeded_data: boolean;
  computed_at: string;
}

export interface IndexDailyResponse {
  status: string;
  method: string;
  count: number;
  data: IndexDailyRecord[];
}

export interface IndexRouteRecord {
  id: number;
  route: string;
  date: string;
  avg_fare: number;
  index_value: number;
  sample_size: number;
  weight: number;
}

export interface IndexRouteResponse {
  route: string;
  count: number;
  data: IndexRouteRecord[];
}

export interface FareQuoteRecord {
  id: number;
  route: string;
  carrier: string;
  flight_number: string;
  window: string;
  base_fare: number | null;
  taxes: number | null;
  udf: number | null;
  convenience_fee: number | null;
  total_fare: number;
  source: string;
  source_type: "live" | "seeded";
  scraped_at: string;
}

export interface FaresResponse {
  count: number;
  quotes: FareQuoteRecord[];
}

/* ------------------------------------------------------------------ */
/*  Typed endpoint functions                                           */
/* ------------------------------------------------------------------ */

export const api = {
  health: () => apiFetch<HealthResponse>("/health", null),

  dailyIndex: (token: string) =>
    apiFetch<IndexDailyResponse>("/index/daily", token),

  routeIndex: (token: string, pair: string) =>
    apiFetch<IndexRouteResponse>(`/index/route/${pair.toUpperCase()}`, token),

  rawFares: (token: string, params?: { route?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.route) qs.set("route", params.route.toUpperCase());
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return apiFetch<FaresResponse>(`/fares/raw${suffix}`, token);
  },

  backtest: (token: string) => apiFetch<unknown>("/backtest/dgca", token),

  triggerSync: (token: string) =>
    apiFetch<{ status: string; scrapes_executed: number; index_points_computed: number }>(
      "/pipeline/trigger-sync",
      token,
      { method: "POST" },
    ),

  triggerSyncSSE: (token: string) =>
    apiFetch<{ status: string; message: string }>(
      "/pipeline/trigger-sync-sse",
      token,
      { method: "POST" },
    ),

  surgeStatus: (token?: string | null) =>
    apiFetch<{ surges: Array<{ route: string; window: string; is_surge: boolean; current_avg: number; baseline_avg: number; pct_above: number }> }>(
      "/pipeline/surge-status",
      token || null,
    ),
};

export const getSSEUrl = (token: string) =>
  `${API_BASE}/events/pipeline?token=${encodeURIComponent(token)}`;
