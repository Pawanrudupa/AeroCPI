"use client";

import { AuthProvider } from "@/lib/auth";
import { DashboardProvider } from "@/lib/dashboard-context";
import { GlobalPlaneCursor } from "@/components/GlobalPlaneCursor";

/**
 * Client-side providers wrapper.
 * Keeps RootLayout as a server component (preserving metadata export)
 * while injecting client-only context providers.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardProvider>
        <GlobalPlaneCursor />
        {children}
      </DashboardProvider>
    </AuthProvider>
  );
}
