"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

const GLYPHS = ["#", "+", "&", "*", "~", "/", "$", "%", "0", "1", "!", "^"];

interface DecryptTextProps {
  text: string;
  className?: string;
  durationFrames?: number;
  frameSpeedMs?: number;
  triggerOnHover?: boolean;
  triggerOnMount?: boolean;
  as?: "h1" | "h2" | "h3" | "span" | "div";
  scrambleTrigger?: number;
}

/**
 * Decrypt / text-scramble effect per DESIGN.md Section 2.
 *
 * Cycles through glyph set (# + & * ~ / $ % 0 1) before locking
 * characters left-to-right into the final text.
 *
 * - triggerOnMount (default true): visibly scrambles on mount then resolves.
 * - triggerOnHover (default true): re-triggers the cyber scramble when hovered.
 * - Resolves instantly under prefers-reduced-motion.
 */
export const DecryptText: React.FC<DecryptTextProps> = ({
  text,
  className = "",
  durationFrames = 20,
  frameSpeedMs = 35,
  triggerOnHover = true,
  triggerOnMount = true,
  as: Component = "span",
  scrambleTrigger = 0,
}) => {
  /* Generate initial scrambled glyphs only if triggerOnMount is true */
  const getScrambled = () =>
    text
      .split("")
      .map((ch) =>
        ch === " " || ch === "\n" ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      )
      .join("");

  const [displayText, setDisplayText] = useState(() =>
    triggerOnMount ? getScrambled() : text,
  );
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

    /* Immediately show fully scrambled glyphs on the very first instant (Image 4 effect) */
    const initialScramble = text
      .split("")
      .map((ch) =>
        ch === " " || ch === "\n" ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      )
      .join("");
    setDisplayText(initialScramble);

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

  /* Fire on mount only if triggerOnMount is true */
  useEffect(() => {
    if (!triggerOnMount) return;
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
  }, [triggerOnMount, startScramble]);

  /* Allow parent to trigger scramble by incrementing a counter */
  useEffect(() => {
    if (scrambleTrigger && scrambleTrigger > 0 && !isScrambling) {
      startScramble();
    }
  }, [scrambleTrigger, startScramble, isScrambling]);

  const handleMouseEnter = () => {
    if (triggerOnHover) {
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
