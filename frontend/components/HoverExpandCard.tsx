"use client";

import React, { useState } from "react";

interface HoverExpandCardProps {
  step: string;
  title: string;
  desc: string;
  accent: string;
  technicalDetails: string;
}

export function HoverExpandCard({ step, title, desc, accent, technicalDetails }: HoverExpandCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="border border-line bg-panel p-5 space-y-3 cursor-pointer transition-colors hover:bg-line/20 group relative overflow-hidden"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-2">
        <span className={`font-mono text-2xl font-bold ${accent}`}>
          {step}
        </span>
        <span className="font-mono text-xs text-text-primary font-bold tracking-wider">
          {title}
        </span>
      </div>
      <p className="text-text-dim text-xs leading-relaxed">
        {desc}
      </p>

      {/* Expanded State via CSS transition to respect prefers-reduced-motion implicitly or we can use animate-in */}
      <div 
        className={`mt-4 pt-4 border-t border-line/50 transition-all duration-300 ease-in-out motion-reduce:transition-none ${
          isExpanded ? "opacity-100 max-h-48" : "opacity-0 max-h-0"
        }`}
      >
        <p className="font-mono text-[10px] text-accent-amber leading-relaxed">
          {technicalDetails}
        </p>
      </div>
    </div>
  );
}
