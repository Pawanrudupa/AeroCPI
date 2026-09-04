"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/lib/dashboard-context";

export function CommandBar() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<{ msg: string; type: "error" | "success" | "info" } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const { setSurgeFilter } = useDashboard();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

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
    } else if (cmd === "surge") {
      setSurgeFilter(true);
      setResponse({ msg: "Surge filter enabled", type: "success" });
    } else if (cmd === "clear") {
      setSurgeFilter(false);
      setResponse({ msg: "Surge filter disabled", type: "success" });
    } else if (cmd === "help") {
      setResponse({
        msg: "Commands: route <PAIR>, surge, clear, help",
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
