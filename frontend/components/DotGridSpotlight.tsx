"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Mouse-tracking dot-grid spotlight background per DESIGN.md Section 3.
 *
 * Renders two stacked dot-grid layers:
 *   1. A dim base grid (always visible, using --line color)
 *   2. A bright amber grid copy masked with a radial-gradient spotlight
 *      centered at the current mouse position (--mx, --my)
 *
 * CSS custom properties --mx / --my are set on this component's root element
 * via requestAnimationFrame, so the .dot-grid-spotlight mask updates at 60fps.
 *
 * Usage: Wrap the hero section's content inside <DotGridSpotlight> so
 * the CSS vars cascade to the dot-grid child divs.
 */
export const DotGridSpotlight: React.FC<{
  children?: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check reduced-motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          container.style.setProperty("--mx", `${x}px`);
          container.style.setProperty("--my", `${y}px`);
          rafRef.current = null;
        });
      }
    };

    const handleMouseEnter = () => setIsActive(true);
    const handleMouseLeave = () => setIsActive(false);

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={
        {
          "--mx": "50%",
          "--my": "50%",
        } as React.CSSProperties
      }
    >
      {/* Layer 1: Dim base dot grid — always visible */}
      <div
        className="absolute inset-0 dot-grid-base pointer-events-none"
        style={{ zIndex: 0, opacity: 0.65 }}
      />

      {/* Layer 2: Bright amber spotlight dot grid — masked to follow cursor */}
      <div
        className="absolute inset-0 dot-grid-spotlight pointer-events-none transition-opacity duration-300"
        style={{ zIndex: 1, opacity: isActive ? 1 : 0 }}
      />

      {/* Content rendered above the dot grid layers */}
      <div className="relative" style={{ zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
};
