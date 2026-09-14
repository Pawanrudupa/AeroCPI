"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/lib/dashboard-context";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

export function CommandBar() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<{ msg: string; type: "error" | "success" | "info" } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const { token, role } = useAuth();
  const { isPipelineRunning, setSurgeFilter, addPipelineEvent } = useDashboard();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const isDev =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true";

  useEffect(() => {
    if (response) {
      const timer = setTimeout(() => setResponse(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [response]);

  const handleCommand = (cmdStr: string) => {
    const trimmed = cmdStr.trim();
    if (!trimmed) return;

    setHistory((prev) => {
      const next = [trimmed, ...prev];
      return next.slice(0, 10);
    });
    setHistoryIndex(-1);

    const parts = trimmed.split(" ").filter(Boolean);
    const cmd = parts[0].toLowerCase();

    if (cmd === "route" && parts.length > 1) {
      const pair = parts[1].toUpperCase();
      router.push(`/dashboard/route/${pair}`);
      setResponse({ msg: `Navigating to ${pair}...`, type: "success" });
    } else if (cmd === "reports" || cmd === "report") {
      router.push("/dashboard/reports");
      setResponse({ msg: "Navigating to Reports...", type: "success" });
    } else if (cmd === "dashboard") {
      router.push("/dashboard");
      setResponse({ msg: "Navigating to Dashboard...", type: "success" });
    } else if (cmd === "account") {
      router.push("/account");
      setResponse({ msg: "Navigating to Account...", type: "success" });
    } else if (cmd === "methodology") {
      router.push("/methodology");
      setResponse({ msg: "Navigating to Methodology...", type: "success" });
    } else if (cmd === "surge" && parts[1]?.toUpperCase() === "DEV") {
      if (isDev) {
        addPipelineEvent({
          event_type: "surge_detected",
          message: "▲ SURGE :: DEL-BOM — 28.5% ABOVE BASELINE [DEV TEST]",
          route: "DEL-BOM",
          source: "dev-test",
          window: "T+7",
          data: { current: 7800, baseline: 6070, pct_above: "28.5" },
          timestamp: new Date().toISOString(),
        });
        setResponse({
          msg: "Dev surge event triggered [DEL-BOM T+7 +28.5%]",
          type: "success",
        });
      }
    } else if (cmd === "surge") {
      setSurgeFilter(true);
      setResponse({ msg: "Surge filter enabled", type: "success" });
    } else if (cmd === "clear") {
      setSurgeFilter(false);
      setResponse({ msg: "Surge filter disabled", type: "success" });
    } else if (cmd === "run") {
      if (!token) {
        setResponse({ msg: "Authentication required to trigger pipeline", type: "error" });
      } else if (role !== "analyst" && role !== "admin") {
        setResponse({ msg: "Analyst or Administrator privileges required to trigger pipeline", type: "error" });
      } else if (isPipelineRunning) {
        setResponse({ msg: "Pipeline is already running. Use 'stop' to cancel.", type: "error" });
      } else {
        const routeArg = parts[1]?.toUpperCase();
        const windowArg = parts[2]?.toUpperCase();
        api.triggerSyncSSE(token, { route: routeArg, window: windowArg })
          .then((res) => {
            setResponse({
              msg: res.message || `Started pipeline [${res.scope || "FULL"}]`,
              type: "success"
            });
          })
          .catch((err) => {
            setResponse({
              msg: err instanceof Error ? err.message : "Failed to start pipeline",
              type: "error"
            });
          });
      }
    } else if (cmd === "stop") {
      if (!token) {
        setResponse({ msg: "Authentication required", type: "error" });
      } else if (role !== "analyst" && role !== "admin") {
        setResponse({ msg: "Analyst or Administrator privileges required to stop pipeline", type: "error" });
      } else if (!isPipelineRunning) {
        setResponse({ msg: "No pipeline is currently running", type: "info" });
      } else {
        api.stopPipeline(token)
          .then(() => {
            setResponse({ msg: "Stop signal sent :: halting pipeline cleanly...", type: "success" });
          })
          .catch((err) => {
            setResponse({
              msg: err instanceof Error ? err.message : "Failed to stop pipeline",
              type: "error"
            });
          });
      }
    } else if (cmd === "help") {
      setResponse({
        msg: isDev
          ? "Commands: run [PAIR] [WINDOW], stop, route <PAIR>, reports, dashboard, surge, clear, surge test [PAIR], help"
          : "Commands: run [PAIR] [WINDOW], stop, route <PAIR>, reports, dashboard, surge, clear, help",
        type: "info",
      });
    } else {
      setResponse({ msg: `UNKNOWN COMMAND: "${cmd}"`, type: "error" });
    }
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCommand(input);
    } else if (e.key === "Escape") {
      setInput("");
      setHistoryIndex(-1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIndex + 1 < history.length ? historyIndex + 1 : historyIndex;
        setHistoryIndex(nextIdx);
        setInput(history[nextIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setInput(history[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput("");
      }
    }
  };

  return (
    <div className="flex flex-col font-mono text-sm">
      <div className="flex items-center bg-bg-void border border-line p-2 rounded">
        <span className="text-accent-amber mr-2 font-bold">aerocpi&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-text-primary outline-none"
          placeholder="Type a command or 'help'..."
          spellCheck={false}
        />
      </div>
      {response && (
        <div
          className={`mt-1 px-2 text-xs ${
            response.type === "error"
              ? "text-alert"
              : response.type === "success"
              ? "text-signal-green"
              : "text-text-dim"
          }`}
        >
          {response.msg}
        </div>
      )}
    </div>
  );
}
