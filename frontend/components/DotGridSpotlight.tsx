"use client";

import React, { useEffect, useRef } from "react";

/**
 * Mouse-tracking dot-grid spotlight background per DESIGN.md Section 3.
 * Two stacked dot-grid layers: dim base and bright copy masked at (--mx, --my).
 * Throttled via requestAnimationFrame for 60fps performance without DOM canvas overhead.
 */
export const DotGridSpotlight: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      targetX = e.clientX - rect.left;
      targetY = e.clientY - rect.top;

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          container.style.setProperty("--mx", `${targetX}px`);
          container.style.setProperty("--my", `${targetY}px`);
          rafRef.current = null;
        });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* Dim base layer */}
      <div className="absolute inset-0 dot-grid-base pointer-events-none z-0 opacity-70" />
      {/* Bright spotlight layer masked with radial gradient */}
      <div className="absolute inset-0 dot-grid-spotlight pointer-events-none z-0" />
      
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
