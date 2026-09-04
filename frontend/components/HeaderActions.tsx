"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDashboard } from "@/lib/dashboard-context";
import { api } from "@/lib/api";

export const HeaderActions: React.FC = () => {
  const { token } = useAuth();
  const { isPipelineRunning, addPipelineEvent } = useDashboard();
  const [isTriggering, setIsTriggering] = useState(false);

  const isDev =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true";

  const handleTriggerPipeline = async () => {
    if (!token || isPipelineRunning || isTriggering) return;
    setIsTriggering(true);
    try {
      await api.triggerSyncSSE(token);
    } catch {
      // error handled by SSE stream or toast
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="flex items-center gap-2 font-mono text-xs ml-2 md:ml-4 border-l border-line pl-3 md:pl-5">
      {isDev && (
        <button
          onClick={() => {
            addPipelineEvent({
              event_type: "surge_detected",
              message: "▲ SURGE :: DEL-BOM — 28.5% ABOVE BASELINE [DEV TEST]",
              route: "DEL-BOM",
              source: "dev-test",
              window: "T+7",
              data: { current: 7800, baseline: 6070, pct_above: "28.5" },
              timestamp: new Date().toISOString(),
            });
          }}
          className="px-2 py-1 bg-transparent border border-line text-text-dim hover:text-alert hover:border-alert transition-colors text-[10px] flex items-center gap-1"
          title="Dev-only test trigger for SurgeToast"
        >
          <span>⚡</span>
          <span className="hidden xl:inline">[DEV] TEST SURGE</span>
        </button>
      )}

      <button
        onClick={handleTriggerPipeline}
        disabled={isPipelineRunning || isTriggering}
        className="px-3 py-1 bg-accent-amber border border-accent-amber text-bg-void hover:bg-accent-amber/90 transition-colors font-bold disabled:opacity-40 flex items-center gap-1.5"
      >
        {isPipelineRunning || isTriggering ? (
          <>
            <span className="w-2 h-2 rounded-full bg-bg-void animate-ping" />
            <span className="hidden lg:inline">RUNNING...</span>
          </>
        ) : (
          <>
            <span>▶</span>
            <span className="hidden sm:inline">RUN LIVE PIPELINE</span>
            <span className="inline sm:hidden">RUN</span>
          </>
        )}
      </button>
    </div>
  );
};
