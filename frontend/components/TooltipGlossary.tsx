"use client";

import React, { useState } from "react";

export function TooltipGlossary({ term, definition }: { term: string; definition: string }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span 
      className="relative inline-block border-b border-dashed border-accent-amber/50 cursor-help"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <span className="text-text-primary">{term}</span>
      {isHovered && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-panel border border-line text-xs font-mono text-text-dim shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
          <span className="text-accent-amber font-bold block mb-1">{term.toUpperCase()}</span>
          {definition}
        </span>
      )}
    </span>
  );
}
