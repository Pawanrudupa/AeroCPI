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
    if (res.status === 401 && typeof window !== "undefined") {
      try {
        localStorage.removeItem("aerocpi_token");
        localStorage.removeItem("aerocpi_email");
        localStorage.removeItem("aerocpi_role");
      } catch {
        /* noop */
      }
      if (window.location.pathname.startsWith("/dashboard")) {
        window.location.href = "/login?expired=1";
      }
    }
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
  currency?: string;
  source: string;
  source_type: "live" | "seeded";
  scraped_at: string;
}

export interface FaresResponse {
  count: number;
  quotes: FareQuoteRecord[];
}

export interface MaterialityGapRoute {
  route: string;
  snapshot_fare: number;
  snapshot_details: string;
  continuous_avg: number;
  divergence_pct: number;
  abs_divergence_pct: number;
  sample_size: number;
  live_quotes: number;
  seeded_quotes: number;
  live_pct: number;
}

export interface MaterialityGapResponse {
  methodology: {
    snapshot_rule: string;
    continuous_rule: string;
    formula: string;
    calendar_period: string;
  };
  provenance: {
    total_quotes: number;
    live_quotes: number;
    seeded_quotes: number;
    live_pct: number;
    seeded_pct: number;
    disclosure: string;
  };
  basket_summary: {
    mean_absolute_divergence_pct: number;
    mean_signed_divergence_pct: number;
    max_route: string | null;
    max_divergence_pct: number;
    min_route: string | null;
    min_divergence_pct: number;
  };
  routes: MaterialityGapRoute[];
}

export interface UserAdminRecord {
  id: number;
  email: string;
  name: string | null;
  organization: string | null;
  role: "admin" | "analyst";
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  must_change_password: boolean;
  has_api_key: boolean;
}

export interface ProvisionUserResponse {
  status: string;
  message: string;
  user: UserAdminRecord;
  temporary_password: string;
}

export interface UserProfileRecord {
  id: number;
  email: string;
  name: string | null;
  organization: string | null;
  role: "admin" | "analyst";
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  must_change_password: boolean;
  api_key_prefix: string | null;
  api_key_created_at: string | null;
}

export interface LoginEventRecord {
  id: number;
  timestamp: string;
  ip_address: string;
  user_agent: string;
  status: "success" | "failed";
}

export interface ApiKeyGenerateResponse {
  status: string;
  api_key: string;
  prefix: string;
  created_at: string;
  message: string;
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

  rawFares: (
    token: string,
    params?: {
      route?: string;
      window?: string;
      source?: string;
      source_type?: string;
      limit?: number;
    }
  ) => {
    const qs = new URLSearchParams();
    if (params?.route && params.route !== "all") qs.set("route", params.route.toUpperCase());
    if (params?.window && params.window !== "all") qs.set("window", params.window.toUpperCase());
    if (params?.source && params.source !== "all") qs.set("source", params.source.toLowerCase());
    if (params?.source_type && params.source_type !== "all") qs.set("source_type", params.source_type.toLowerCase());
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return apiFetch<FaresResponse>(`/fares/raw${suffix}`, token);
  },

  coverageMatrix: (token: string) =>
    apiFetch<{
      total_quotes_in_db: number;
      matrix: Record<
        string,
        Record<string, { total: number; live: number; seeded: number }>
      >;
    }>("/reports/coverage-matrix", token),

  backtest: (token: string) => apiFetch<unknown>("/backtest/dgca", token),

  triggerSync: (token: string) =>
    apiFetch<{ status: string; scrapes_executed: number; index_points_computed: number }>(
      "/pipeline/trigger-sync",
      token,
      { method: "POST" },
    ),

  triggerSyncSSE: (token: string, params?: { route?: string; window?: string }) => {
    const query = new URLSearchParams();
    if (params?.route) query.set("route", params.route);
    if (params?.window) query.set("window", params.window);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return apiFetch<{ status: string; message: string; scope?: string }>(
      `/pipeline/trigger-sync-sse${qs}`,
      token,
      { method: "POST" },
    );
  },

  stopPipeline: (token: string) =>
    apiFetch<{ status: string; message: string }>(
      "/pipeline/stop",
      token,
      { method: "POST" },
    ),

  surgeStatus: (token?: string | null) =>
    apiFetch<{ surges: Array<{ route: string; window: string; is_surge: boolean; current_avg: number; baseline_avg: number; pct_above: number }> }>(
      "/pipeline/surge-status",
      token || null,
    ),

  materialityGap: (token?: string | null) =>
    apiFetch<MaterialityGapResponse>(
      "/public/materiality-gap",
      token || null,
    ),

  /* Admin Endpoints */
  adminListUsers: (token: string) =>
    apiFetch<UserAdminRecord[]>("/admin/users", token),

  adminProvisionUser: (
    token: string,
    data: { email: string; name: string; organization: string; role: string }
  ) =>
    apiFetch<ProvisionUserResponse>("/admin/users", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  adminToggleUserStatus: (token: string, userId: number, isActive: boolean) =>
    apiFetch<{ status: string; user_id: number; is_active: boolean }>(
      `/admin/users/${userId}/status`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive }),
      }
    ),

  adminChangeUserRole: (token: string, userId: number, role: string) =>
    apiFetch<{ status: string; user_id: number; role: string }>(
      `/admin/users/${userId}/role`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }
    ),

  adminResetPassword: (token: string, userId: number) =>
    apiFetch<{ status: string; message: string; temporary_password: string }>(
      `/admin/users/${userId}/reset-password`,
      token,
      { method: "POST" }
    ),

  /* Account & Profile Endpoints */
  getProfile: (token: string) =>
    apiFetch<UserProfileRecord>("/account/profile", token),

  updateProfile: (
    token: string,
    data: { name?: string; organization?: string }
  ) =>
    apiFetch<UserProfileRecord>("/account/profile", token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  changePassword: (
    token: string,
    data: { current_password: string; new_password: string }
  ) =>
    apiFetch<{ status: string; message: string }>("/account/change-password", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getLoginHistory: (token: string) =>
    apiFetch<LoginEventRecord[]>("/account/login-history", token),

  generateApiKey: (token: string) =>
    apiFetch<ApiKeyGenerateResponse>("/account/api-key", token, {
      method: "POST",
    }),

  revokeApiKey: (token: string) =>
    apiFetch<{ status: string; message: string }>("/account/api-key", token, {
      method: "DELETE",
    }),
};

export const getSSEUrl = (token: string) =>
  `${API_BASE}/events/pipeline?token=${encodeURIComponent(token)}`;
