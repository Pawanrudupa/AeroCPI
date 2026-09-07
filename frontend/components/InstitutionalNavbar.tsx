"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

export function InstitutionalNavbar() {
  const { isAuthenticated, userEmail, role, logout } = useAuth();
  const pathname = usePathname();
  const [apiStatus, setApiStatus] = useState<"connected" | "offline" | "checking">("checking");

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

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-panel/95 backdrop-blur-md px-4 md:px-8 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        {/* Left: System identifier + status */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-accent-amber font-bold tracking-wider hover:underline flex-shrink-0 whitespace-nowrap"
          >
            <h1 className="inline m-0 text-inherit text-xs font-bold">[ AeroCPI TERMINAL ]</h1>
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
            INSTITUTIONAL ACCESS PORTAL
          </span>
        </div>

        {/* Right: Navigation + user + logout */}
        <div className="flex items-center gap-3 text-[11px]">
          {/* Nav links */}
          <nav className="flex items-center gap-1.5 border-r border-line pr-3 mr-1">
            <Link
              href="/dashboard"
              className={`px-2 py-1 transition-colors font-bold ${
                pathname === "/dashboard" || pathname.startsWith("/dashboard/route")
                  ? "text-accent-amber border-b border-accent-amber"
                  : "text-text-dim hover:text-text-primary hover:bg-panel"
              }`}
            >
              [ DASHBOARD ]
            </Link>
            <Link
              href="/dashboard/reports"
              className={`px-2 py-1 transition-colors font-bold ${
                pathname.startsWith("/dashboard/reports")
                  ? "text-accent-amber border-b border-accent-amber"
                  : "text-text-dim hover:text-text-primary hover:bg-panel"
              }`}
            >
              [ REPORTS ]
            </Link>
            <Link
              href="/methodology"
              className={`px-2 py-1 transition-colors font-bold ${
                pathname.startsWith("/methodology")
                  ? "text-accent-amber border-b border-accent-amber"
                  : "text-text-dim hover:text-text-primary hover:bg-panel"
              }`}
            >
              [ METHODOLOGY ]
            </Link>
            <Link
              href="/account"
              className={`px-2 py-1 transition-colors font-bold ${
                pathname.startsWith("/account")
                  ? "text-accent-amber border-b border-accent-amber"
                  : "text-text-dim hover:text-text-primary hover:bg-panel"
              }`}
            >
              [ ACCOUNT ]
            </Link>
            {role === "admin" && (
              <Link
                href="/admin/users"
                className={`px-2 py-1 transition-colors font-bold ${
                  pathname.startsWith("/admin")
                    ? "text-signal-green border-b border-signal-green"
                    : "text-signal-green/80 hover:text-signal-green hover:bg-panel"
                }`}
              >
                [ ADMIN ]
              </Link>
            )}
          </nav>

          {/* User info */}
          {isAuthenticated && (
            <span className="text-text-dim hidden sm:inline">
              {userEmail}
              {role && (
                <span
                  className={`ml-1 ${
                    role === "admin" ? "text-signal-green font-bold" : "text-accent-amber"
                  }`}
                >
                  [{role.toUpperCase()}]
                </span>
              )}
            </span>
          )}

          {/* Logout */}
          {isAuthenticated ? (
            <button
              onClick={logout}
              className="px-2 py-1 text-alert hover:text-text-primary hover:bg-alert/10 transition-colors border border-transparent hover:border-alert/30"
            >
              [ LOGOUT ]
            </button>
          ) : (
            <Link
              href="/login"
              className="px-2 py-1 text-accent-amber hover:text-text-primary transition-colors"
            >
              [ LOGIN ]
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
