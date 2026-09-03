"use client";

import React, { useEffect, useState, useRef } from "react";

interface Checkpoint {
  progress: number;
  label: string;
  status: string;
  price: string;
  altitude: string;
}

const CHECKPOINTS: Checkpoint[] = [
  { progress: 0.0, label: "DEL (Indira Gandhi Intl)", status: "TAXI / DEPARTURE [06:00]", price: "₹ 5,100 (T+15 Base)", altitude: "GND" },
  { progress: 0.45, label: "EN ROUTE (FL360)", status: "CRUISE :: SECTOR RAJASTHAN", price: "₹ 5,600 (Basket Wtd)", altitude: "36,000 FT" },
  { progress: 0.95, label: "BOM (Chhatrapati Shivaji)", status: "APPROACH / LANDING [08:15]", price: "₹ 6,000 (T+7 Peak)", altitude: "2,500 FT" },
];

/**
 * Hero scroll-flight interaction per DESIGN.md Section 1.
 * SVG arc path (DEL->BOM), plane icon positioned via getPointAtLength() driven by scroll.
 * Checkpoint telemetry updates informatively as scroll advances.
 * Respects prefers-reduced-motion by rendering a static baseline.
 */
export const HeroScrollFlight: React.FC = () => {
  const pathRef = useRef<SVGPathElement>(null);
  const [planeCoord, setPlaneCoord] = useState<{ x: number; y: number; angle: number }>({
    x: 60,
    y: 190,
    angle: -25,
  });
  const [activeCheckpoint, setActiveCheckpoint] = useState<Checkpoint>(CHECKPOINTS[0]);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsReducedMotion(true);
      return;
    }

    const handleScroll = () => {
      if (!pathRef.current) return;
      const path = pathRef.current;
      const pathLength = path.getTotalLength();

      // Scoped scroll: progress across top 600px of scroll
      const scrollY = window.scrollY;
      const maxScroll = 600;
      const rawProgress = Math.min(Math.max(scrollY / maxScroll, 0), 1);

      const currentPoint = path.getPointAtLength(rawProgress * pathLength);
      // Small delta forward for heading calculation
      const nextPoint = path.getPointAtLength(Math.min(rawProgress * pathLength + 2, pathLength));

      const dx = nextPoint.x - currentPoint.x;
      const dy = nextPoint.y - currentPoint.y;
      const heading = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

      setPlaneCoord({
        x: currentPoint.x,
        y: currentPoint.y,
        angle: heading,
      });

      // Update active checkpoint
      if (rawProgress < 0.3) {
        setActiveCheckpoint(CHECKPOINTS[0]);
      } else if (rawProgress < 0.75) {
        setActiveCheckpoint(CHECKPOINTS[1]);
      } else {
        setActiveCheckpoint(CHECKPOINTS[2]);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="relative w-full border border-line bg-panel p-5 rounded-sm">
      <div className="flex items-center justify-between border-b border-line pb-2 mb-4 font-mono text-xs">
        <span className="text-signal-green flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
          [ ROUTE CORRIDOR :: DEL → BOM ]
        </span>
        <span className="text-text-dim">FREQ: 74 FLIGHTS/DAY</span>
      </div>

      {/* SVG Arc Flight Path */}
      <div className="relative w-full h-[220px]">
        <svg
          viewBox="0 0 500 240"
          className="w-full h-full overflow-visible"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Subtle grid lines */}
          <line x1="60" y1="20" x2="60" y2="220" stroke="#262316" strokeDasharray="3 3" />
          <line x1="440" y1="20" x2="440" y2="220" stroke="#262316" strokeDasharray="3 3" />
          
          {/* Background Corridor Arc */}
          <path
            d="M 60 190 Q 250 30 440 190"
            fill="none"
            stroke="#262316"
            strokeWidth="3"
          />

          {/* Active Flight Path Arc */}
          <path
            ref={pathRef}
            d="M 60 190 Q 250 30 440 190"
            fill="none"
            stroke="#C9A227"
            strokeWidth="2"
            strokeDasharray="4 4"
            className="opacity-80"
          />

          {/* Origin Node DEL */}
          <circle cx="60" cy="190" r="5" fill="#7FB86B" />
          <text x="60" y="215" fill="#E8E4D4" fontSize="11" fontFamily="JetBrains Mono" textAnchor="middle">
            DEL
          </text>

          {/* Destination Node BOM */}
          <circle cx="440" cy="190" r="5" fill="#C9A227" />
          <text x="440" y="215" fill="#E8E4D4" fontSize="11" fontFamily="JetBrains Mono" textAnchor="middle">
            BOM
          </text>

          {/* Scrubbed Flight Aircraft */}
          {!isReducedMotion && (
            <g
              transform={`translate(${planeCoord.x}, ${planeCoord.y}) rotate(${planeCoord.angle})`}
            >
              <path
                d="M 0 -10 L 4 -3 L 11 0 L 4 3 L 0 10 L -2 3 L -8 0 L -2 -3 Z"
                fill="#C9A227"
                stroke="#0A0A07"
                strokeWidth="1"
              />
              <circle cx="0" cy="0" r="14" fill="none" stroke="#C9A227" strokeWidth="0.75" strokeOpacity="0.4" />
            </g>
          )}
        </svg>
      </div>

      {/* Discrete Informational Telemetry Readout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-line pt-3 font-mono text-xs">
        <div>
          <span className="text-text-dim block">SECTOR CHECKPOINT</span>
          <span className="text-text-primary font-medium">{activeCheckpoint.label}</span>
        </div>
        <div>
          <span className="text-text-dim block">HUD FLIGHT STATUS</span>
          <span className="text-signal-green">{activeCheckpoint.status}</span>
        </div>
        <div>
          <span className="text-text-dim block">INDICATIVE TARIFF</span>
          <span className="text-accent-amber font-bold">{activeCheckpoint.price}</span>
        </div>
      </div>
    </div>
  );
};
