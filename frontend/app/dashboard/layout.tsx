"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

/**
 * Dashboard layout — wraps all /dashboard/* routes.
 *
 * Responsibilities:
 *   1. Auth guard: redirects to /login if no valid JWT.
 *   2. Dashboard chrome: top nav bar with system status, user info, logout.
 *   3. Passes children (the actual dashboard page content).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, userEmail, role, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [apiStatus, setApiStatus] = useState<"connected" | "offline" | "checking">("checking");

  /* Auth guard */
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  /* Probe API health on mount */
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
        setApiStatus(res.ok ? "connected" : "offline");
      } catch {
        setApiStatus("offline");
      }
    }
    checkHealth();
  }, []);

  /* Don't render dashboard content until auth is confirmed */
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-bg-void flex items-center justify-center">
        <span className="font-mono text-xs text-text-dim animate-pulse">
          REDIRECTING TO AUTH...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-void text-text-primary">
      {/* ============================================================ */}
      {/*  DASHBOARD NAV BAR                                            */}
      {/* ============================================================ */}
      <header className="border-b border-line bg-panel/80 backdrop-blur-md sticky top-0 z-40 px-4 md:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          {/* Left: System identifier + status */}
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-accent-amber font-bold tracking-wider hover:underline"
            >
              [ AeroCPI TERMINAL ]
            </Link>

            <span className="hidden sm:inline text-text-dim">|</span>

            <span
              className={`hidden sm:inline flex items-center gap-1.5 ${
                apiStatus === "connected"
                  ? "text-signal-green"
                  : apiStatus === "offline"
                    ? "text-alert"
                    : "text-text-dim"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiStatus === "connected"
                    ? "bg-signal-green animate-pulse"
                    : apiStatus === "offline"
                      ? "bg-alert"
                      : "bg-text-dim animate-pulse"
                }`}
              />
              {apiStatus === "connected"
                ? "API CONNECTED"
                : apiStatus === "offline"
                  ? "API OFFLINE"
                  : "CHECKING..."}
            </span>

            <span className="hidden md:inline text-text-dim">|</span>
            <span className="hidden md:inline text-text-dim">
              BASKET: 6 SECTORS × 3 WINDOWS
            </span>
          </div>

          {/* Right: Navigation + user + logout */}
          <div className="flex items-center gap-3 text-[11px]">
            {/* Nav links */}
            <Link
              href="/dashboard"
              className={`px-2 py-1 transition-colors ${
                pathname === "/dashboard"
                  ? "text-accent-amber border-b border-accent-amber"
                  : "text-text-dim hover:text-text-primary"
              }`}
            >
              INDEX
            </Link>

            {/* User info */}
            <span className="text-text-dim hidden sm:inline">
              {userEmail}
              {role && (
                <span className="ml-1 text-signal-green">
                  [{role.toUpperCase()}]
                </span>
              )}
            </span>

            {/* Logout */}
            <button
              onClick={logout}
              className="px-2 py-1 text-alert hover:text-text-primary hover:bg-alert/10 transition-colors border border-transparent hover:border-alert/30"
            >
              [ LOGOUT ]
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/*  PAGE CONTENT                                                 */}
      {/* ============================================================ */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">{children}</div>

      {/* ============================================================ */}
      {/*  DASHBOARD FOOTER                                             */}
      {/* ============================================================ */}
      <footer className="border-t border-line bg-panel px-4 md:px-8 py-5 font-mono text-xs text-text-dim">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-text-primary font-bold">
              AeroCPI PROTOTYPE
            </span>{" "}
            — GEKS-Törnqvist (Eurostat/ILO)
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>DGCA PROVENANCE VERIFIED</span>
            <span className="text-signal-green">
              SESSION: JWT ACTIVE
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
