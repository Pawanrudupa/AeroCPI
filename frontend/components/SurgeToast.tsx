"use client";

import React, { useEffect, useState } from "react";
import { useDashboard, PipelineSSEEvent } from "@/lib/dashboard-context";

interface ToastProps {
  id: string;
  route: string;
  pct_above: string;
  onDismiss: (id: string) => void;
}

function Toast({ id, route, pct_above, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(id), 500); // Wait for fade out
    }, 6000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      className={`mb-2 bg-panel border-2 border-accent-amber text-text-primary font-mono p-3 rounded shadow-lg transition-opacity duration-500 flex items-center ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <span className="text-alert mr-2">▲</span>
      <span>
        SURGE DETECTED: <span className="font-bold text-accent-amber">{route}</span> — {pct_above}% above baseline
      </span>
    </div>
  );
}

export function SurgeToast() {
  const { pipelineEvents } = useDashboard();
  const [toasts, setToasts] = useState<{ id: string; route: string; pct_above: string }[]>([]);
  const [processedEventIds, setProcessedEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Process only recent unhandled events
    const newSurgeEvents = pipelineEvents.filter(
      (ev) => ev.event_type === "surge_detected"
    );

    let hasNew = false;
    const newToasts = [...toasts];
    const newProcessed = new Set(processedEventIds);

    newSurgeEvents.forEach((ev) => {
      const eventId = `${ev.timestamp}-${ev.route}`;
      if (!processedEventIds.has(eventId)) {
        hasNew = true;
        newProcessed.add(eventId);
        
        const pct_above = ev.data?.pct_above ? String(ev.data.pct_above) : "??";
        
        newToasts.push({
          id: eventId,
          route: ev.route,
          pct_above,
        });
      }
    });

    if (hasNew) {
      // Keep up to 3
      while (newToasts.length > 3) {
        newToasts.shift();
      }
      setToasts(newToasts);
      setProcessedEventIds(newProcessed);
    }
  }, [pipelineEvents]); // Intentionally not including processedEventIds/toasts to avoid loops

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
