"use client";

import React, { useEffect, useRef } from "react";

interface InteractiveDotGridProps {
  children?: React.ReactNode;
  className?: string;
  dotSpacing?: number; // Distance between dots in px
  dotRadius?: number;  // Resting dot radius in px
  repulsionRadius?: number; // Influence radius R around cursor
  repulsionStrength?: number; // Max displacement in px
  color?: string; // Dot color (RGB components: "201, 162, 39")
  baseOpacity?: number; // Opacity when resting
  activeOpacity?: number; // Opacity when displaced
}

interface Dot {
  originX: number;
  originY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

/**
 * Interactive HTML5 Canvas Magnetic/Repelling Dot Grid Matrix.
 *
 * Implements:
 *   - Uniform grid generation across viewport / container bounds.
 *   - Inverse-distance vector repulsion when cursor enters radius R.
 *   - Smooth spring-damper / lerp elastic return to grid equilibrium.
 *   - Spatial bounding-box optimization for 60fps performance.
 *   - Retina/HiDPI display crispness (window.devicePixelRatio).
 *   - Non-destructive pointer-events: none canvas overlay / background.
 */
export const DotGridSpotlight: React.FC<InteractiveDotGridProps> = ({
  children,
  className = "",
  dotSpacing = 28,
  dotRadius = 1.4,
  repulsionRadius = 110,
  repulsionStrength = 32,
  color = "201, 162, 39", // Amber / Gold theme
  baseOpacity = 0.28,
  activeOpacity = 0.95,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -9999,
    y: -9999,
    active: false,
  });
  const dotsRef = useRef<Dot[]>([]);
  const animFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;

    /**
     * Rebuild dot grid array when dimensions change.
     */
    const initGrid = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);

      const dots: Dot[] = [];
      const cols = Math.floor(width / dotSpacing);
      const rows = Math.floor(height / dotSpacing);

      // Center grid within container
      const offsetX = (width - cols * dotSpacing) / 2 + dotSpacing / 2;
      const offsetY = (height - rows * dotSpacing) / 2 + dotSpacing / 2;

      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          const originX = offsetX + c * dotSpacing;
          const originY = offsetY + r * dotSpacing;
          dots.push({
            originX,
            originY,
            x: originX,
            y: originY,
            vx: 0,
            vy: 0,
            radius: dotRadius,
          });
        }
      }

      dotsRef.current = dots;
    };

    initGrid();

    // Resize Observer to accurately track container resizing (dynamic content / responsive)
    const resizeObserver = new ResizeObserver(() => {
      initGrid();
    });
    resizeObserver.observe(container);

    /**
     * Mouse tracking: attached to window so movement is captured
     * even when hovering over buttons, cards, links, or text.
     */
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      // Only activate when within or near container
      if (
        clientX >= -repulsionRadius &&
        clientX <= width + repulsionRadius &&
        clientY >= -repulsionRadius &&
        clientY <= height + repulsionRadius
      ) {
        mouseRef.current.x = clientX;
        mouseRef.current.y = clientY;
        mouseRef.current.active = true;
      } else {
        mouseRef.current.active = false;
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);

    /**
     * Physics simulation & rendering loop
     */
    const spring = 0.08; // Spring return stiffness
    const friction = 0.82; // Velocity damping factor
    const rSq = repulsionRadius * repulsionRadius;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const dots = dotsRef.current;
      const mouse = mouseRef.current;
      const isMouseActive = mouse.active && !prefersReducedMotion;
      const mx = mouse.x;
      const my = mouse.y;

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];

        if (isMouseActive) {
          // Bounding box pre-check to bypass heavy math
          const dx = dot.x - mx;
          const dy = dot.y - my;

          if (Math.abs(dx) < repulsionRadius && Math.abs(dy) < repulsionRadius) {
            const distSq = dx * dx + dy * dy;

            if (distSq < rSq && distSq > 0.001) {
              const dist = Math.sqrt(distSq);
              // Force increases with proximity: (1 - d/R)
              const force = (1 - dist / repulsionRadius) * repulsionStrength;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              dot.vx += fx;
              dot.vy += fy;
            }
          }
        }

        // Hooke's Law Spring Force towards origin
        const homeDx = dot.originX - dot.x;
        const homeDy = dot.originY - dot.y;
        dot.vx += homeDx * spring;
        dot.vy += homeDy * spring;

        // Damping
        dot.vx *= friction;
        dot.vy *= friction;

        // Update position
        dot.x += dot.vx;
        dot.y += dot.vy;

        // Distance from resting origin determines highlight intensity
        const displacement = Math.hypot(dot.x - dot.originX, dot.y - dot.originY);
        const displacementRatio = Math.min(displacement / (repulsionStrength * 0.8), 1);
        const currentOpacity = baseOpacity + (activeOpacity - baseOpacity) * displacementRatio;
        const currentRadius = dotRadius + 0.6 * displacementRatio;

        // Draw dot
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${currentOpacity.toFixed(3)})`;
        ctx.fill();
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      resizeObserver.disconnect();
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [
    dotSpacing,
    dotRadius,
    repulsionRadius,
    repulsionStrength,
    color,
    baseOpacity,
    activeOpacity,
  ]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* HTML5 Canvas Background: pointer-events: none, z-index: 0 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
      />

      {/* Foreground Content: clickable & interactive, z-index: 1 */}
      <div className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
};
