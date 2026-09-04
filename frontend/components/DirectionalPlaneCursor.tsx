"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";

interface DirectionalPlaneCursorProps {
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Directional airplane cursor scoped strictly to the hero section
 * per DESIGN.md Section 4.
 *
 * - Replaces the native cursor with a rotated airplane SVG inside the container.
 * - Rotation angle computed via Math.atan2(dy, dx) on frame-to-frame mouse delta.
 * - Adds 'hero-cursor-none' class to the container to hide the native cursor.
 * - Disabled on touch devices and when prefers-reduced-motion is set.
 * - Does NOT affect cursors anywhere else (dashboard, forms, nav).
 */
export const DirectionalPlaneCursor: React.FC<DirectionalPlaneCursorProps> = ({
  containerRef,
}) => {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [angle, setAngle] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const lastPosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const handleEnter = useCallback(() => {
    setIsVisible(true);
    containerRef.current?.classList.add("hero-cursor-none");
  }, [containerRef]);

  const handleLeave = useCallback(() => {
    setIsVisible(false);
    containerRef.current?.classList.remove("hero-cursor-none");
  }, [containerRef]);

  useEffect(() => {
    /* Gate: touch device or reduced motion */
    const isTouch =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
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
        handleLeave();
        return;
      }

      if (!isVisible) handleEnter();

      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          const dx = curX - lastPosRef.current.x;
          const dy = curY - lastPosRef.current.y;

          /* Only recompute heading if movement exceeds 3px dead zone */
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

    const handleMouseLeaveContainer = () => handleLeave();

    window.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeaveContainer);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeaveContainer);
      container.classList.remove("hero-cursor-none");
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, handleEnter, handleLeave, isVisible]);

  if (!isVisible || !position) return null;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        zIndex: 50,
        willChange: "transform, left, top",
        transition: "transform 60ms ease-out",
      }}
    >
      {/* Airplane silhouette pointing upward (0°) — rotated by atan2 heading */}
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
