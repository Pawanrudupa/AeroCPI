"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDashboard } from "@/lib/dashboard-context";
import { api } from "@/lib/api";

export const HeaderActions: React.FC = () => {
  const { token, role } = useAuth();
  const { isPipelineRunning } = useDashboard();
  const [isTriggering, setIsTriggering] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [selectedScope, setSelectedScope] = useState<string>("DEL-BOM:T+7");

  // Only institutional ANALYST and ADMIN roles can trigger or stop pipelines
  if (role !== "analyst" && role !== "admin") {
    return null;
  }

  const handleTriggerPipeline = async () => {
    if (!token || isPipelineRunning || isTriggering) return;
    setIsTriggering(true);

    let routeParam: string | undefined;
    let windowParam: string | undefined;

    if (selectedScope !== "FULL") {
      if (selectedScope.includes(":")) {
        const [r, w] = selectedScope.split(":");
        routeParam = r;
        windowParam = w;
      } else {
        routeParam = selectedScope;
      }
    }

    try {
      await api.triggerSyncSSE(token, {
        route: routeParam,
        window: windowParam,
      });
    } catch {
      // error handled by SSE stream or toast
    } finally {
      setIsTriggering(false);
    }
  };

  const handleStopPipeline = async () => {
    if (!token || !isPipelineRunning || isStopping) return;
    setIsStopping(true);
    try {
      await api.stopPipeline(token);
    } catch {
      // error handled by SSE
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div className="flex items-center gap-2 font-mono text-xs ml-2 md:ml-4 border-l border-line pl-3 md:pl-5">

      {/* Scope Selector for Cheaper Single-Route Testing */}
      {!isPipelineRunning && (
        <select
          value={selectedScope}
          onChange={(e) => setSelectedScope(e.target.value)}
          className="bg-panel border border-line text-text-primary px-2 py-1 text-[11px] font-mono focus:border-accent-amber focus:outline-none"
          title="Select pipeline scope (single route test mode saves SerpAPI quota)"
        >
          <option value="DEL-BOM:T+7">⚡ DEL-BOM (T+7) [1 call]</option>
          <option value="DEL-BOM">DEL-BOM All [3 calls]</option>
          <option value="DEL-BLR">DEL-BLR All [3 calls]</option>
          <option value="BOM-BLR">BOM-BLR All [3 calls]</option>
          <option value="DEL-CCU">DEL-CCU All [3 calls]</option>
          <option value="BLR-HYD">BLR-HYD All [3 calls]</option>
          <option value="MAA-DEL">MAA-DEL All [3 calls]</option>
          <option value="FULL">FULL BASKET [18 calls]</option>
        </select>
      )}

      {/* Run Pipeline Button */}
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
            <span className="hidden sm:inline">RUN PIPELINE</span>
            <span className="inline sm:hidden">RUN</span>
          </>
        )}
      </button>

      {/* STOP PIPELINE Control (Visible whenever pipeline is active) */}
      {isPipelineRunning && (
        <button
          onClick={handleStopPipeline}
          disabled={isStopping}
          className="px-3 py-1 bg-alert/20 border border-alert text-alert hover:bg-alert hover:text-bg-void transition-colors font-bold flex items-center gap-1.5 animate-pulse"
          title="Stop running pipeline cleanly — partial captures will be preserved"
        >
          <span>■</span>
          <span>{isStopping ? "STOPPING..." : "STOP PIPELINE"}</span>
        </button>
      )}
    </div>
  );
};
