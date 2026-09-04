"use client";

import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface DashboardContextType {
  surgeFilterActive: boolean;
  setSurgeFilter: (active: boolean) => void;
  /** SSE event stream for pipeline - shared across dashboard components */
  pipelineEvents: PipelineSSEEvent[];
  addPipelineEvent: (event: PipelineSSEEvent) => void;
  clearPipelineEvents: () => void;
  isPipelineRunning: boolean;
  setIsPipelineRunning: (running: boolean) => void;
}

export interface PipelineSSEEvent {
  event_type: string;
  message: string;
  route: string;
  source: string;
  window: string;
  data: Record<string, unknown>;
  timestamp: string;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [surgeFilterActive, setSurgeFilterActive] = useState(false);
  const [pipelineEvents, setPipelineEvents] = useState<PipelineSSEEvent[]>([]);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);

  const setSurgeFilter = useCallback((active: boolean) => {
    setSurgeFilterActive(active);
  }, []);

  const addPipelineEvent = useCallback((event: PipelineSSEEvent) => {
    setPipelineEvents((prev) => {
      const next = [...prev, event];
      // Keep max 200 events in buffer
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  const clearPipelineEvents = useCallback(() => {
    setPipelineEvents([]);
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        surgeFilterActive,
        setSurgeFilter,
        pipelineEvents,
        addPipelineEvent,
        clearPipelineEvents,
        isPipelineRunning,
        setIsPipelineRunning,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextType {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return ctx;
}
