"use client";

import React, { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";

interface RouteCorridor {
  route: string;
  origin: string;
  destination: string;
  flightsPerDay: string;
  defaultFare: number;
  window: string;
  tOffset: number; // Mid-route progression position (0.3 to 0.7)
}

const CORRIDORS: RouteCorridor[] = [
  {
    route: "DEL-BOM",
    origin: "DEL",
    destination: "BOM",
    flightsPerDay: "74 FLIGHTS/DAY",
    defaultFare: 5400,
    window: "T+15",
    tOffset: 0.52,
  },
  {
    route: "DEL-BLR",
    origin: "DEL",
    destination: "BLR",
    flightsPerDay: "52 FLIGHTS/DAY",
    defaultFare: 5800,
    window: "T+15",
    tOffset: 0.64,
  },
  {
    route: "BOM-BLR",
    origin: "BOM",
    destination: "BLR",
    flightsPerDay: "46 FLIGHTS/DAY",
    defaultFare: 4150,
    window: "T+15",
    tOffset: 0.38,
  },
  {
    route: "DEL-CCU",
    origin: "DEL",
    destination: "CCU",
    flightsPerDay: "38 FLIGHTS/DAY",
    defaultFare: 4650,
    window: "T+15",
    tOffset: 0.45,
  },
];

import { DecryptText } from "@/components/DecryptText";

/**
 * Calculates point (x, y) and tangent angle on quadratic Bézier curve:
 * P0=(10, 22), P1=(60, 4), P2=(110, 22)
 */
function getBezierPoint(t: number) {
  const p0 = { x: 10, y: 22 };
  const p1 = { x: 60, y: 4 };
  const p2 = { x: 110, y: 22 };

  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;

  const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return { x, y, angle };
}

/**
 * SparklineArc: Compact thumbnail arc for a single route corridor.
 * Eliminates redundant origin markers and locks the aircraft directly onto the curve.
 */
function SparklineArc({
  origin,
  destination,
  tProgress,
}: {
  origin: string;
  destination: string;
  tProgress: number;
}) {
  const pt = getBezierPoint(tProgress);

  return (
    <div className="relative w-full h-7 flex items-center justify-center">
      <svg
        viewBox="0 0 120 28"
        className="w-full h-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background corridor trajectory */}
        <path
          d="M 10 22 Q 60 4 110 22"
          fill="none"
          stroke="#262316"
          strokeWidth="2"
        />

        {/* Active dashed flight path */}
        <path
          d="M 10 22 Q 60 4 110 22"
          fill="none"
          stroke="#C9A227"
          strokeWidth="1.25"
          strokeDasharray="2.5 2.5"
          className="opacity-75"
        />

        {/* Origin node */}
        <circle cx="10" cy="22" r="2.5" fill="#7FB86B" />
        <text
          x="10"
          y="27"
          fill="#8A8672"
          fontSize="7"
          fontFamily="JetBrains Mono"
          textAnchor="middle"
        >
          {origin}
        </text>

        {/* Destination node */}
        <circle cx="110" cy="22" r="2.5" fill="#C9A227" />
        <text
          x="110"
          y="27"
          fill="#8A8672"
          fontSize="7"
          fontFamily="JetBrains Mono"
          textAnchor="middle"
        >
          {destination}
        </text>

        {/* Aircraft silhouette locked precisely onto the arc path */}
        <g transform={`translate(${pt.x}, ${pt.y}) rotate(${pt.angle})`}>
          <path
            d="M 4 0 L -1 -3 L -0.5 -1 L -3 -1.5 L -3.5 -0.5 L -2 0 L -3.5 0.5 L -3 1.5 L -0.5 1 L -1 3 Z"
            fill="#C9A227"
          />
        </g>
      </svg>
    </div>
  );
}

/**
 * RouteRow: Individual hoverable route row managing its own flight-sweep
 * and decrypt-flicker states.
 */
function RouteRow({
  corridor,
  fare,
  isSurge,
  windowTag,
  scrollProgress,
  isReducedMotion,
}: {
  corridor: RouteCorridor;
  fare: number;
  isSurge: boolean;
  windowTag: string;
  scrollProgress: number;
  isReducedMotion: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [scrambleTrigger, setScrambleTrigger] = useState(0);
  const [hoverT, setHoverT] = useState(0); // 0 to 1 progress of the hover sweep
  const animRef = useRef<number>();

  // Base progress driven by scroll
  const baseTProgress = isReducedMotion
    ? corridor.tOffset
    : Math.min(
        Math.max(corridor.tOffset + (scrollProgress - 0.5) * 0.28, 0.15),
        0.85
      );

  // Animate flight sweep on hover
  useEffect(() => {
    if (isReducedMotion) return;

    let start = performance.now();
    let initialT = hoverT;
    const targetT = isHovered ? 1 : 0;
    const duration = 500; // ms

    if (initialT === targetT) return;

    function draw(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOutCubic for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const newT = initialT + (targetT - initialT) * easeProgress;
      setHoverT(newT);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(draw);
      }
    }
    
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isHovered, isReducedMotion]); // intentionally omit hoverT to avoid retriggers

  // The actual aircraft position blends between base scroll pos and destination (0.85) based on hoverT
  const currentTProgress = baseTProgress + (0.85 - baseTProgress) * hoverT;

  return (
    <div
      onMouseEnter={() => {
        setIsHovered(true);
        if (!isReducedMotion) {
          setScrambleTrigger((prev) => prev + 1);
        }
      }}
      onMouseLeave={() => setIsHovered(false)}
      className={`grid grid-cols-12 gap-2 items-center py-2.5 px-3 border transition-all duration-300 rounded-sm cursor-default ${
        isHovered
          ? "border-accent-amber/60 bg-accent-amber/[0.04] shadow-[0_0_12px_rgba(201,162,39,0.1)]"
          : "border-line/70 bg-bg-void/80"
      }`}
    >
      {/* Route Code & Traffic Frequency */}
      <div className="col-span-4 sm:col-span-4 space-y-0.5">
        <div className="font-mono font-bold text-xs sm:text-sm text-text-primary tracking-tight">
          {corridor.origin}{" "}
          <span className="text-accent-amber font-normal">→</span>{" "}
          {corridor.destination}
        </div>
        <div className="font-mono text-[9px] sm:text-[10px] text-text-dim tracking-wider">
          {corridor.flightsPerDay}
        </div>
      </div>

      {/* Sparkline Thumbnail Arc */}
      <div className="col-span-4 sm:col-span-4">
        <SparklineArc
          origin={corridor.origin}
          destination={corridor.destination}
          tProgress={currentTProgress}
        />
      </div>

      {/* Indicative Tariff & Window Status */}
      <div className="col-span-4 sm:col-span-4 text-right space-y-0.5">
        <div className="font-mono font-bold text-xs sm:text-sm text-accent-amber">
          <DecryptText
            text={`₹ ${fare.toLocaleString()}`}
            triggerOnHover={false} // hover handled by parent row
            scrambleTrigger={scrambleTrigger}
            frameSpeedMs={30}
            durationFrames={15}
          />
        </div>
        <div className="font-mono text-[9px] sm:text-[10px] text-text-dim flex items-center justify-end gap-1.5">
          <span className="bg-panel px-1 py-0.2 border border-line/80 text-text-dim">
            {windowTag}
          </span>
          {isSurge ? (
            <span className="text-alert font-bold">▲ SURGE</span>
          ) : (
            <span className="text-signal-green">NORMAL</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * HeroRouteCorridorStrip (Multi-Route Mini Strip)
 * Replaces the single large DEL-BOM arc box with a compact, dense 4-route HUD strip.
 * Reuses the exact same route data powering the dashboard heatmap.
 */
export const HeroScrollFlight: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [surgeData, setSurgeData] = useState<
    Record<string, { fare: number; isSurge: boolean; window: string }>
  >({});

  // Detect prefers-reduced-motion
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setIsReducedMotion(true);
    }
  }, []);

  // Fetch live indicative fares from the same source as dashboard heatmap
  useEffect(() => {
    let isMounted = true;
    async function loadFares() {
      try {
        const res = await api.surgeStatus();
        if (res && res.surges && isMounted) {
          const map: Record<
            string,
            { fare: number; isSurge: boolean; window: string }
          > = {};
          res.surges.forEach((s) => {
            if (s.window === "T+15" || !map[s.route]) {
              map[s.route] = {
                fare: s.current_avg > 0 ? s.current_avg : 0,
                isSurge: s.is_surge,
                window: s.window,
              };
            }
          });
          setSurgeData(map);
        }
      } catch {
        // Silently use deterministic fallback values
      }
    }
    loadFares();
    return () => {
      isMounted = false;
    };
  }, []);

  // Subtle scroll-driven movement across the arc if motion is enabled
  useEffect(() => {
    if (isReducedMotion) return;

    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrolled = -rect.top;
      const range = rect.height + window.innerHeight * 0.4;
      const progress = Math.min(Math.max(scrolled / range, 0), 1);
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isReducedMotion]);

  return (
    <div
      ref={containerRef}
      className="relative w-full border border-line bg-panel p-4 md:p-5 rounded-sm"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-line pb-3 mb-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
          <span className="text-accent-amber font-bold tracking-wider">
            [ SECTOR CORRIDOR :: LIVE BASKET ]
          </span>
        </div>
        <span className="text-text-dim text-[10px] sm:text-[11px]">
          4 TRUNK CORRIDORS • T+15
        </span>
      </div>

      {/* 4 Route Mini-Cards Strip */}
      <div className="space-y-2">
        {CORRIDORS.map((corridor) => {
          const live = surgeData[corridor.route];
          const fare = live && live.fare > 0 ? live.fare : corridor.defaultFare;
          const isSurge = live ? live.isSurge : false;
          const windowTag = live ? live.window : corridor.window;

          return (
            <RouteRow
              key={corridor.route}
              corridor={corridor}
              fare={fare}
              isSurge={isSurge}
              windowTag={windowTag}
              scrollProgress={scrollProgress}
              isReducedMotion={isReducedMotion}
            />
          );
        })}
      </div>

      {/* Compact Instrument Footer */}
      <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between font-mono text-[10px] text-text-dim">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-amber inline-block" />
          GEKS-TÖRNQVIST BASKET
        </span>
        <span className="text-text-primary">
          PROVENANCE: DGCA VERIFIED
        </span>
      </div>
    </div>
  );
};
