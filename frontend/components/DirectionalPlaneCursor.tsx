"use client";

import React, { useEffect, useState, useRef } from "react";

interface DirectionalPlaneCursorProps {
  containerRef: React.RefObject<HTMLElement>;
}

/**
 * Directional plane cursor scoped strictly to hero per DESIGN.md Section 4.
 * Computes rotation angle via Math.atan2(dy, dx) on frame delta.
 * Disables on touch devices and leaves native cursors intact outside.
 */
export const DirectionalPlaneCursor: React.FC<DirectionalPlaneCursorProps> = ({ containerRef }) => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [angle, setAngle] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Check if touch device or reduced motion
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isTouch || prefersReducedMotion) return;

    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const inBounds =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!inBounds) {
        setIsVisible(false);
        return;
      }

      setIsVisible(true);
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          const dx = curX - lastPosRef.current.x;
          const dy = curY - lastPosRef.current.y;

          // Only compute new heading angle if moved significantly (> 3px)
          if (Math.hypot(dx, dy) > 3) {
            // Standard atan2 returns angle in radians from x-axis; convert to degrees + 90deg offset for upright plane
            const targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
            setAngle(targetAngle);
          }

          setPosition({ x: curX, y: curY });
          lastPosRef.current = { x: curX, y: curY };
          rafRef.current = null;
        });
      }
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (container) container.removeEventListener("mouseleave", handleMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef]);

  if (!isVisible || !position) return null;

  return (
    <div
      className="pointer-events-none absolute z-50 transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-accent-amber drop-shadow-[0_0_6px_rgba(201,162,39,0.8)]"
      >
        <path
          d="M12 2L14.5 9H21L17 13.5L18.5 21L12 17L5.5 21L7 13.5L3 9H9.5L12 2Z"
          fill="currentColor"
          stroke="#0A0A07"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
};
