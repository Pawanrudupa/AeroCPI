"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

const GLYPHS = ["#", "+", "&", "*", "~", "/", "$", "%", "0", "1", "!", "^"];

interface DecryptTextProps {
  text: string;
  className?: string;
  durationFrames?: number;
  frameSpeedMs?: number;
  triggerOnHover?: boolean;
  as?: "h1" | "h2" | "h3" | "span" | "div";
}

/**
 * Decrypt / text-scramble effect per DESIGN.md Section 2.
 * Cycles glyph set (# + & * ~ / $ % 0 1) before locking left-to-right into final text.
 * Triggers on load and on hover. Resolves instantly under prefers-reduced-motion.
 */
export const DecryptText: React.FC<DecryptTextProps> = ({
  text,
  className = "",
  durationFrames = 20,
  frameSpeedMs = 35,
  triggerOnHover = true,
  as: Component = "span",
}) => {
  const [displayText, setDisplayText] = useState<string>(text);
  const [isScrambling, setIsScrambling] = useState<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);

  const startScramble = useCallback(() => {
    // Check prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayText(text);
      return;
    }

    setIsScrambling(true);
    let frame = 0;
    const totalFrames = durationFrames;

    const interval = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const lockIndex = Math.floor(progress * text.length);

      const scrambled = text
        .split("")
        .map((char, index) => {
          if (char === " " || char === "\n") return char;
          if (index < lockIndex) return text[index];
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");

      setDisplayText(scrambled);

      if (frame >= totalFrames) {
        clearInterval(interval);
        setDisplayText(text);
        setIsScrambling(false);
      }
    }, frameSpeedMs);

    return () => clearInterval(interval);
  }, [text, durationFrames, frameSpeedMs]);

  // Trigger once on page load per DESIGN.md
  useEffect(() => {
    const cleanup = startScramble();
    return () => {
      if (cleanup) cleanup();
    };
  }, [startScramble]);

  const handleMouseEnter = () => {
    if (triggerOnHover && !isScrambling) {
      startScramble();
    }
  };

  return (
    <Component
      className={`inline-block select-none ${className}`}
      onMouseEnter={handleMouseEnter}
      aria-label={text}
    >
      {displayText}
    </Component>
  );
};
