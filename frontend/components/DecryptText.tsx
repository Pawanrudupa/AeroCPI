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
  scrambleTrigger?: number;
}

/**
 * Decrypt / text-scramble effect per DESIGN.md Section 2.
 *
 * Cycles through glyph set (# + & * ~ / $ % 0 1) before locking
 * characters left-to-right into the final text.
 *
 * - Triggers ONCE on page load (guaranteed — not dependent on hover).
 * - Re-triggers on hover if triggerOnHover is true.
 * - Resolves instantly under prefers-reduced-motion.
 *
 * How to observe:
 *   On page load the headline visibly scrambles for ~700ms then resolves.
 *   Hover the text to re-trigger the scramble.
 */
export const DecryptText: React.FC<DecryptTextProps> = ({
  text,
  className = "",
  durationFrames = 20,
  frameSpeedMs = 35,
  triggerOnHover = true,
  as: Component = "span",
  scrambleTrigger = 0,
}) => {
  /* Start with scrambled glyphs so the first frame is visibly scrambled */
  const scrambledInitial = text
    .split("")
    .map((ch) =>
      ch === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    )
    .join("");

  const [displayText, setDisplayText] = useState(scrambledInitial);
  const [isScrambling, setIsScrambling] = useState(false);
  const hasRunOnLoadRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startScramble = useCallback(() => {
    /* Respect prefers-reduced-motion */
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplayText(text);
      return;
    }

    /* Prevent overlapping animations */
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsScrambling(true);
    let frame = 0;

    intervalRef.current = setInterval(() => {
      frame++;
      const progress = frame / durationFrames;
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

      if (frame >= durationFrames) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setDisplayText(text);
        setIsScrambling(false);
      }
    }, frameSpeedMs);
  }, [text, durationFrames, frameSpeedMs]);

  /* Fire exactly once on mount — guarded by ref so React strict mode
     double-invocation doesn't cause a visible double-scramble */
  useEffect(() => {
    if (hasRunOnLoadRef.current) return;
    hasRunOnLoadRef.current = true;

    /* Small delay so the initial scrambled state is visible first */
    const timer = setTimeout(() => {
      startScramble();
    }, 120);

    return () => {
      clearTimeout(timer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Allow parent to trigger scramble by incrementing a counter */
  useEffect(() => {
    if (scrambleTrigger && scrambleTrigger > 0 && !isScrambling) {
      startScramble();
    }
  }, [scrambleTrigger, startScramble, isScrambling]);

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
