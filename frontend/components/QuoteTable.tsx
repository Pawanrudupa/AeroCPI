"use client";

import React, { useState } from "react";

export interface DisplayQuote {
  id?: number;
  route: string;
  carrier: string;
  flight_number: string;
  window: string;
  base_fare: number | null;
  taxes: number | null;
  udf?: number | null;
  convenience_fee?: number | null;
  total_fare: number;
  source: string;
  source_type: "live" | "seeded";
  scraped_at?: string;
}

interface QuoteTableProps {
  quotes: DisplayQuote[];
}

export const QuoteTable: React.FC<QuoteTableProps> = ({
  quotes,
}) => {
  const [filterSourceType, setFilterSourceType] = useState<string>("all");
  const [filterRoute, setFilterRoute] = useState<string>("all");

  const filtered = quotes.filter((q) => {
    if (filterSourceType !== "all" && q.source_type !== filterSourceType) return false;
    if (filterRoute !== "all" && q.route !== filterRoute) return false;
    return true;
  });

  return (
    <div className="bg-panel border border-line p-5 rounded-sm">
      <div className="flex flex-wrap items-center justify-between border-b border-line pb-3 mb-4 gap-3">
        <div>
          <span className="font-mono text-xs text-accent-amber block">[ TELEMETRY :: RAW QUOTE AUDIT LOG ]</span>
          <h2 className="text-base font-semibold text-text-primary">
            Normalized Fare Components & Origin Verification
          </h2>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          {/* Filter by Origin / Source Type */}
          <select
            value={filterSourceType}
            onChange={(e) => setFilterSourceType(e.target.value)}
            className="bg-bg-void border border-line text-text-primary px-2 py-1 rounded-sm text-xs"
          >
            <option value="all">ALL DATA ORIGINS</option>
            <option value="live">LIVE SCRAPED ONLY</option>
            <option value="seeded">SEEDED / FALLBACK ONLY</option>
          </select>

        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs border-collapse">
          <thead>
            <tr className="border-b border-line text-text-dim text-left">
              <th className="py-2 px-3">ORIGIN</th>
              <th className="py-2 px-3">ROUTE</th>
              <th className="py-2 px-3">FLIGHT</th>
              <th className="py-2 px-3">WINDOW</th>
              <th className="py-2 px-3 text-right">BASE FARE</th>
              <th className="py-2 px-3 text-right">TAXES/FEES</th>
              <th className="py-2 px-3 text-right">TOTAL FARE</th>
              <th className="py-2 px-3 text-center">SOURCE</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 15).map((q, idx) => {
              const isLive = q.source_type === "live";
              const taxesTotal = (q.taxes || 0) + (q.udf || 0) + (q.convenience_fee || 0);

              return (
                <tr key={idx} className="border-b border-line/40 hover:bg-white/[0.02]">
                  {/* Origin Badge (Mandatory: live vs seeded) */}
                  <td className="py-2.5 px-3">
                    {isLive ? (
                      <span className="inline-flex items-center gap-1 px-1 py-[1px] rounded-xs text-[9px] font-bold bg-signal-green/10 text-signal-green border border-signal-green/30">
                        <span className="w-1 h-1 rounded-full bg-signal-green animate-pulse" />
                        LIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1 py-[1px] rounded-xs text-[9px] font-bold bg-accent-amber/10 text-accent-amber border border-accent-amber/30">
                        SEEDED
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 font-semibold text-text-primary">{q.route}</td>
                  <td className="py-2.5 px-3 text-text-dim">{q.flight_number}</td>
                  <td className="py-2.5 px-3 text-accent-amber font-semibold">{q.window}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-text-dim">
                    {q.base_fare ? `₹${q.base_fare.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-text-dim">
                    {taxesTotal > 0 ? `₹${taxesTotal.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-bold text-text-primary">
                    ₹{q.total_fare.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-center text-text-dim uppercase text-[10px]">
                    {q.source}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-line text-[11px] font-mono text-text-dim flex justify-between">
        <span>SHOWING {Math.min(filtered.length, 15)} OF {filtered.length} CAPTURED QUOTES</span>
        <span className="text-signal-green">NORMALIZATION: base_fare + taxes + fees = total_fare</span>
      </div>
    </div>
  );
};
