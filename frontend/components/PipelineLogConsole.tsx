"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDashboard, type PipelineSSEEvent } from "@/lib/dashboard-context";
import { API_BASE, api } from "@/lib/api";

/**
 * Live pipeline event log console.
 *
 * - Subscribes to GET /events/pipeline SSE stream via fetch + ReadableStream
 *   (not EventSource, because EventSource doesn't support Authorization headers;
 *    we pass JWT as a query param instead).
 * - Renders scrolling monospace terminal log lines.
 * - Idle state when no pipeline is running.
 * - "Run Live Pipeline" button triggers POST /pipeline/trigger-sync-sse.
 */

const EVENT_COLORS: Record<string, string> = {
  connected: "text-signal-green",
  pipeline_start: "text-signal-green",
  pipeline_end: "text-signal-green",
  scrape_start: "text-text-dim",
  scrape_ok: "text-signal-green",
  scrape_warn: "text-accent-amber",
  scrape_error: "text-alert",
  clean_step: "text-text-dim",
  index_recomputed: "text-accent-amber",
  backtest_update: "text-text-primary",
  surge_detected: "text-alert",
  pipeline_idle: "text-text-dim",
};

export const PipelineLogConsole: React.FC = () => {
  const { token } = useAuth();
  const {
    pipelineEvents,
    addPipelineEvent,
    isPipelineRunning,
    setIsPipelineRunning,
  } = useDashboard();

  const [isConnected, setIsConnected] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* Auto-scroll to bottom when new events arrive */
  useEffect(() => {
    if (!isCollapsed) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [pipelineEvents.length, isCollapsed]);

  /* Connect to SSE stream */
  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    abortRef.current = controller;

    async function connectSSE() {
      try {
        const url = `${API_BASE}/events/pipeline?token=${encodeURIComponent(token!)}`;
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!response.ok || !response.body) {
          setIsConnected(false);
          return;
        }

        setIsConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const chunk of lines) {
            if (chunk.startsWith(": heartbeat")) continue;
            const dataLine = chunk
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;

            try {
              const event: PipelineSSEEvent = JSON.parse(
                dataLine.slice(6),
              );
              addPipelineEvent(event);

              if (event.event_type === "pipeline_start") {
                setIsPipelineRunning(true);
              } else if (
                event.event_type === "pipeline_end" ||
                event.event_type === "pipeline_idle"
              ) {
                setIsPipelineRunning(false);
              }
            } catch {
              /* malformed SSE data — skip */
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setIsConnected(false);
      }
    }

    connectSSE();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [token, addPipelineEvent, setIsPipelineRunning]);

  /* Trigger pipeline */
  const handleTriggerPipeline = async () => {
    if (!token || isPipelineRunning || isTriggering) return;
    setIsTriggering(true);
    try {
      await api.triggerSyncSSE(token);
    } catch {
      /* trigger failed — SSE stream will report the error */
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="bg-panel border border-line rounded-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-accent-amber font-bold">
            [ SYSTEM :: PIPELINE LOG ]
          </span>
          <span
            className={`flex items-center gap-1 ${
              isConnected ? "text-signal-green" : "text-alert"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected
                  ? "bg-signal-green animate-pulse"
                  : "bg-alert"
              }`}
            />
            {isConnected ? "SSE CONNECTED" : "DISCONNECTED"}
          </span>
          {isPipelineRunning && (
            <span className="text-accent-amber flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-ping" />
              PIPELINE ACTIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Dev-only surge toast test trigger */}
          {(process.env.NODE_ENV !== "production" ||
            process.env.NEXT_PUBLIC_DEV_MODE === "true") && (
            <button
              onClick={() => {
                addPipelineEvent({
                  event_type: "surge_detected",
                  message:
                    "▲ SURGE :: DEL-BOM — 28.5% ABOVE BASELINE [DEV TEST TRIGGER]",
                  route: "DEL-BOM",
                  source: "dev-test",
                  window: "T+7",
                  data: { current: 7800, baseline: 6070, pct_above: "28.5" },
                  timestamp: new Date().toLocaleTimeString("en-GB"),
                });
              }}
              className="px-2.5 py-1 bg-alert/10 border border-alert/40 text-alert hover:bg-alert hover:text-bg-void transition-colors font-bold text-[11px] flex items-center gap-1"
              title="Dev-only test trigger for SurgeToast rehearsal"
            >
              <span>⚡</span>
              <span>[DEV] TEST SURGE TOAST</span>
            </button>
          )}

          <button
            onClick={handleTriggerPipeline}
            disabled={isPipelineRunning || isTriggering || !isConnected}
            className="px-3 py-1 bg-accent-amber/10 border border-accent-amber text-accent-amber hover:bg-accent-amber hover:text-bg-void transition-colors font-bold disabled:opacity-40 flex items-center gap-1.5"
          >
            {isPipelineRunning || isTriggering ? (
              <>
                <span className="w-2 h-2 rounded-full bg-accent-amber animate-ping" />
                RUNNING...
              </>
            ) : (
              <>
                <span>▶</span>
                RUN LIVE PIPELINE
              </>
            )}
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="px-2 py-1 text-text-dim hover:text-text-primary transition-colors"
          >
            {isCollapsed ? "▼ EXPAND" : "▲ COLLAPSE"}
          </button>
        </div>
      </div>

      {/* Log body */}
      {!isCollapsed && (
        <div className="h-[200px] overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed bg-bg-void/50">
          {pipelineEvents.length === 0 ? (
            <div className="flex items-center gap-2 text-text-dim py-8 justify-center">
              <span className="w-2 h-2 rounded-full bg-text-dim animate-pulse" />
              SYSTEM IDLE — AWAITING NEXT PIPELINE RUN
            </div>
          ) : (
            pipelineEvents.map((event, idx) => (
              <div
                key={idx}
                className={`py-0.5 ${EVENT_COLORS[event.event_type] || "text-text-dim"}`}
              >
                <span className="text-text-dim mr-2">
                  [{event.timestamp}]
                </span>
                <span>{event.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
};
