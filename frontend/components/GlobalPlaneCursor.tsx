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
      {/* Authentic airplane silhouette pointing upward (0°) — rotated by atan2 heading */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="#C9A227"
        stroke="#0A0A07"
        strokeWidth="0.75"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_0_8px_rgba(201,162,39,0.7)]"
      >
        <path d="M12 2c-.55 0-1 .45-1 1v6.5L3.5 14c-.3.2-.5.5-.5.8v1.4c0 .4.4.7.8.6L11 15v4l-2.5 2c-.2.2-.3.4-.3.7v.5c0 .4.4.7.8.6l3-1 3 1c.4.1.8-.2.8-.6v-.5c0-.3-.1-.5-.3-.7L13 19v-4l7.2 1.8c.4.1.8-.2.8-.6v-1.4c0-.3-.2-.6-.5-.8L13 9.5V3c0-.55-.45-1-1-1z" />
      </svg>
    </div>
  );
};
