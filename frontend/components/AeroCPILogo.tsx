"use client";

import React from "react";

export interface AeroCPILogoProps {
  /** Size preset or custom pixel width/height */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero" | number;
  /** Whether to enable live rotating effect (default: true) */
  animated?: boolean;
  /** Rotating effect style: 'continuous' (steady smooth spin) | 'radar' (spin with radar sweep beam) | 'subtle' (slow gyroscopic) */
  effect?: "continuous" | "radar" | "subtle";
  /** Optional text to display next to the logo */
  showText?: boolean;
  /** Format of the accompanying text */
  textVariant?: "terminal" | "bracket" | "simple";
  /** Optional custom class name */
  className?: string;
  /** Use full logo graphic (emblem + text) instead of emblem mark */
  variant?: "emblem" | "full";
}

const SIZE_MAP: Record<string, number> = {
  xs: 18,
  sm: 24,
  md: 32,
  lg: 44,
  xl: 60,
  hero: 110,
};

export function AeroCPILogo({
  size = "sm",
  animated = true,
  effect = "radar",
  showText = false,
  textVariant = "terminal",
  className = "",
  variant = "emblem",
}: AeroCPILogoProps) {
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size] || 24;

  const animationClass = animated
    ? effect === "subtle"
      ? "animate-[spin_24s_linear_infinite]"
      : effect === "radar"
        ? "animate-[spin_16s_linear_infinite]"
        : "animate-[spin_12s_linear_infinite]"
    : "";

  return (
    <div
      className={`inline-flex items-center gap-2 select-none group ${className}`}
      title="AeroCPI — Real-time Airfare Price Index for India"
    >
      {/* Emblem / Mark Container */}
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: pixelSize, height: pixelSize }}
      >
        {/* Subtle ambient radar glow */}
        {animated && (
          <div
            className="absolute inset-[-15%] rounded-full opacity-30 group-hover:opacity-75 blur-[3px] transition-opacity duration-500 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(201, 162, 39, 0.45) 0%, rgba(201, 162, 39, 0) 70%)",
            }}
          />
        )}

        {/* Live radar sweep beam overlay (when effect='radar') */}
        {animated && effect === "radar" && (
          <div
            className="absolute inset-[-6%] rounded-full pointer-events-none opacity-40 group-hover:opacity-85 transition-opacity duration-300 animate-[spin_4s_linear_infinite]"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 280deg, rgba(201, 162, 39, 0.1) 320deg, rgba(201, 162, 39, 0.5) 360deg)",
            }}
          />
        )}

        {/* The AeroCPI Logo Image with Live Rotation */}
        <div
          className={`w-full h-full relative flex items-center justify-center transition-transform duration-700 ease-out group-hover:scale-105 ${animationClass}`}
          style={{ transformOrigin: "50% 50%" }}
        >
          <img
            src={variant === "full" ? "/logo-transparent.png" : "/logo-emblem-smooth.png"}
            alt="AeroCPI"
            width={pixelSize}
            height={pixelSize}
            className="w-full h-full object-contain filter drop-shadow-[0_0_4px_rgba(201,162,39,0.35)] group-hover:drop-shadow-[0_0_8px_rgba(201,162,39,0.7)] transition-[filter] duration-300"
          />
        </div>
      </div>

      {/* Optional Accompanying Text */}
      {showText && (
        <span className="font-mono text-accent-amber font-bold tracking-wider whitespace-nowrap">
          {textVariant === "terminal" && "[ AeroCPI TERMINAL ]"}
          {textVariant === "bracket" && "[ AeroCPI ]"}
          {textVariant === "simple" && "AeroCPI"}
        </span>
      )}
    </div>
  );
}

export default AeroCPILogo;
