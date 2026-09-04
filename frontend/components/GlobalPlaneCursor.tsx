"use client";

import React, { useState, useEffect, useRef } from "react";

/**
 * Global directional airplane cursor.
 *
 * - Tracks mouse globally across the entire window.
 * - Replaces native cursor with a scaled-up rotating airplane SVG.
 * - Adds 'global-cursor-none' to document.body when active.
 */
export const GlobalPlaneCursor: React.FC = () => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [angle, setAngle] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const lastPosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    /* Gate: touch device or reduced motion */
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isTouch || prefersReducedMotion) return;

    // Apply global cursor hiding
    document.body.classList.add("global-cursor-none");
    setIsVisible(true);

    const handleMouseMove = (e: MouseEvent) => {
      const curX = e.clientX;
      const curY = e.clientY;

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          const dx = curX - lastPosRef.current.x;
          const dy = curY - lastPosRef.current.y;

          /* Recompute heading if movement exceeds dead zone */
          if (Math.hypot(dx, dy) > 3) {
            const heading = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
            setAngle(heading);
          }

          setPosition({ x: curX, y: curY });
          lastPosRef.current = { x: curX, y: curY };
          rafRef.current = null;
        });
      }
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
      document.body.classList.remove("global-cursor-none");
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!isVisible || !position) return null;

  return (
    <div
      className="pointer-events-none fixed"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        zIndex: 9999, // Ensure it's on top of everything
        willChange: "transform, left, top",
        transition: "transform 60ms ease-out",
      }}
    >
      {/* Scaled up airplane silhouette */}
      <svg
        width="44"
        height="44"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_0_12px_rgba(201,162,39,0.8)]"
      >
        <path
          d="M12 2 L13.5 8 L20 10 L13.5 12 L13.5 19 L12 17 L10.5 19 L10.5 12 L4 10 L10.5 8 Z"
          fill="#C9A227"
          stroke="#0A0A07"
          strokeWidth="0.5"
        />
      </svg>
    </div>
  );
};
