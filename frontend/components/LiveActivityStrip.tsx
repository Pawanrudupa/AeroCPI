"use client";

import React, { useEffect, useState, useRef } from "react";
import { api, type PublicActivityItem } from "@/lib/api";

export function LiveActivityStrip() {
  const [activities, setActivities] = useState<PublicActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchActivity = async () => {
      try {
        const data = await api.publicActivitySummary();
        if (isMounted) {
          setActivities(data.recent_activity || []);
        }
      } catch (err) {
        // Silently handle offline/error state; loading will clear
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchActivity();
    // Refresh every 60 seconds
    const intervalId = setInterval(fetchActivity, 60000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full h-8 bg-bg-void border-b border-line flex items-center px-4 overflow-hidden relative z-40">
         <span className="font-mono text-[10px] sm:text-xs text-text-dim">CONNECTING TO EVENT STREAM...</span>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="w-full h-8 bg-bg-void border-b border-line flex items-center px-4 overflow-hidden relative z-40">
         <span className="font-mono text-[10px] sm:text-xs text-text-dim">NO RECENT ACTIVITY DETECTED. PIPELINE IDLE.</span>
      </div>
    );
  }

  // Duplicate activities to create a seamless infinite scroll effect
  const displayActivities = [...activities, ...activities];

  return (
    <div className="w-full h-8 bg-bg-void border-b border-line flex items-center overflow-hidden relative z-40 group">
      <div className="absolute left-0 w-12 h-full bg-gradient-to-r from-bg-void to-transparent z-10 pointer-events-none"></div>
      <div className="absolute right-0 w-12 h-full bg-gradient-to-l from-bg-void to-transparent z-10 pointer-events-none"></div>
      
      <div 
        className="flex whitespace-nowrap animate-marquee group-hover:[animation-play-state:paused]"
        style={{
          animationDuration: `${Math.max(activities.length * 4, 20)}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite'
        }}
      >
        {displayActivities.map((act, i) => (
          <div key={i} className="inline-flex items-center px-6 gap-3 font-mono text-[10px] sm:text-xs">
            <span className="text-text-dim">
              {act.timestamp ? new Date(act.timestamp).toLocaleTimeString([], { hour12: false }) : "00:00:00"}
            </span>
            <span className={act.status === "LIVE" ? "text-signal-green" : "text-accent-amber"}>
              [{act.status}]
            </span>
            <span className="text-text-primary">{act.route}</span>
            <span className="text-text-dim">@</span>
            <span className="text-text-primary">{act.source}</span>
            <span className="text-text-dim ml-4">•</span>
          </div>
        ))}
      </div>
    </div>
  );
}
