"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardMethodologyRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/methodology");
  }, [router]);

  return (
    <div className="flex items-center justify-center p-12">
      <span className="font-mono text-xs text-text-dim animate-pulse">
        REDIRECTING TO METHODOLOGY &amp; RESEARCH FOUNDATIONS...
      </span>
    </div>
  );
}
