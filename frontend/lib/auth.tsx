"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AuthState {
  token: string | null;
  userEmail: string | null;
  role: string | null;
  isAuthenticated: boolean;
}

interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  isHydrated: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEYS = {
  token: "aerocpi_token",
  email: "aerocpi_email",
  role: "aerocpi_role",
} as const;

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const AuthContext = createContext<AuthContextType | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

function isTokenValid(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const decoded = JSON.parse(jsonPayload);
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return false; // Expired
    }
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [state, setState] = useState<AuthState>({
    token: null,
    userEmail: null,
    role: null,
    isAuthenticated: false,
  });
  const [isHydrated, setIsHydrated] = useState(false);

  /* Hydrate from localStorage exactly once on mount, verifying token expiry */
  useEffect(() => {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.token);
      const userEmail = localStorage.getItem(STORAGE_KEYS.email);
      const role = localStorage.getItem(STORAGE_KEYS.role);
      if (token && userEmail && isTokenValid(token)) {
        setState({ token, userEmail, role, isAuthenticated: true });
      } else if (token) {
        // Token was present but is expired or invalid -> purge it
        Object.values(STORAGE_KEYS).forEach((k) => {
          localStorage.removeItem(k);
        });
        setState({
          token: null,
          userEmail: null,
          role: null,
          isAuthenticated: false,
        });
      }
    } catch {
      /* SSR / incognito — localStorage may throw */
    }
    setIsHydrated(true);
  }, []);

  /* ---- login ---- */
  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return {
            success: false,
            error:
              (body as Record<string, string>).detail ||
              `Authentication failed (HTTP ${res.status})`,
          };
        }

        const data = await res.json();
        localStorage.setItem(STORAGE_KEYS.token, data.access_token);
        localStorage.setItem(STORAGE_KEYS.email, data.user_email);
        localStorage.setItem(STORAGE_KEYS.role, data.role);

        setState({
          token: data.access_token,
          userEmail: data.user_email,
          role: data.role,
          isAuthenticated: true,
        });

        return { success: true };
      } catch {
        return {
          success: false,
          error: "Network error — is the API server running on port 8000?",
        };
      }
    },
    [],
  );

  /* ---- logout ---- */
  const logout = useCallback(() => {
    Object.values(STORAGE_KEYS).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* noop */
      }
    });
    setState({
      token: null,
      userEmail: null,
      role: null,
      isAuthenticated: false,
    });
    router.push("/login");
  }, [router]);

  /* ---- authenticated fetch wrapper ---- */
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(options.headers);
      if (state.token) {
        headers.set("Authorization", `Bearer ${state.token}`);
      }
      const res = await fetch(url, { ...options, headers });

      /* Auto-logout on 401 (expired token) */
      if (res.status === 401) {
        logout();
      }
      return res;
    },
    [state.token, logout],
  );

  /* Render a blank shell until localStorage is hydrated to avoid flash */
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-bg-void" aria-hidden="true" />
    );
  }

  return (
    <AuthContext.Provider
      value={{ ...state, login, logout, authFetch, isHydrated }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
