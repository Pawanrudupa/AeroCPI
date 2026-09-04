"use client";

import React from "react";

interface FareRecord {
  total_fare: number;
  scraped_at?: string;
}

interface TrendIndicatorProps {
  fares: FareRecord[];
}

export function TrendIndicator({ fares }: TrendIndicatorProps) {
  if (!fares || fares.length < 5) {
    return (
      <div className="inline-flex items-center text-xs font-mono text-text-dim">
        <span className="mr-1">→</span>
        <span>insufficient data</span>
      </div>
    );
  }

  // Sort descending by scraped_at (assuming newer is better, or just use as provided if sorted)
  const sorted = [...fares].sort((a, b) => {
    const timeA = a.scraped_at ? new Date(a.scraped_at).getTime() : 0;
    const timeB = b.scraped_at ? new Date(b.scraped_at).getTime() : 0;
    return timeB - timeA;
  });

  const allTotal = sorted.reduce((sum, f) => sum + f.total_fare, 0);
  const mean = allTotal / sorted.length;

  const last5 = sorted.slice(0, 5);
  const aboveCount = last5.filter((f) => f.total_fare > mean).length;
  const belowCount = last5.filter((f) => f.total_fare < mean).length;

  if (aboveCount >= 3) {
    return (
      <div className="inline-flex items-center text-xs font-mono text-signal-green">
        <span className="mr-1">↑</span>
        <span>{aboveCount} of last 5 captures above mean</span>
      </div>
    );
  } else if (belowCount >= 3) {
    return (
      <div className="inline-flex items-center text-xs font-mono text-accent-amber">
        <span className="mr-1">↓</span>
        <span>{belowCount} of last 5 captures below mean</span>
      </div>
    );
  } else {
    return (
      <div className="inline-flex items-center text-xs font-mono text-text-dim">
        <span className="mr-1">→</span>
        <span>stable: within normal range</span>
      </div>
    );
  }
}
