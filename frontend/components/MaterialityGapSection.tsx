"use client";

import React, { useEffect, useState } from "react";
import { api, type MaterialityGapResponse } from "@/lib/api";

interface MaterialityGapProps {
  /** Optional title override */
  title?: string;
  /** Whether to render in compact card mode or full section mode */
  variant?: "full" | "card";
}

export function MaterialityGapSection({ title, variant = "full" }: MaterialityGapProps) {
  const [data, setData] = useState<MaterialityGapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadGapData() {
      try {
        const res = await api.materialityGap();
        if (isMounted) {
          setData(res);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load materiality gap data");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadGapData();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="border border-line bg-panel p-6 rounded-sm text-center">
        <span className="text-xs font-mono text-text-dim animate-pulse">
          CALCULATING EMPIRICAL MATERIALITY GAP ACROSS REAL QUOTE DATA...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border border-line bg-panel p-6 rounded-sm text-center">
        <span className="text-xs font-mono text-alert">
          {error || "Materiality gap metrics currently unavailable"}
        </span>
      </div>
    );
  }

  const { methodology, provenance, basket_summary, routes } = data;

  return (
    <div className="space-y-6">
      {/* Header Block */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-mono text-xs text-accent-amber">
            [ EMPIRICAL VALIDATION :: MATERIALITY GAP ANALYSIS ]
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-line bg-bg-void text-[11px] font-mono">
            <span className="w-2 h-2 rounded-full bg-signal-green"></span>
            <span className="text-signal-green font-bold">{provenance.live_pct}% LIVE</span>
            <span className="text-text-dim">/ {provenance.seeded_pct}% SEEDED</span>
          </span>
        </div>
        <h3 className="text-xl md:text-2xl font-bold text-text-primary">
          {title || "Quantifying the Distortion: Monthly Sampling vs. Continuous Tracking"}
        </h3>
        <p className="text-xs md:text-sm text-text-dim leading-relaxed font-sans max-w-3xl">
          Using real captured database telemetry ({provenance.total_quotes.toLocaleString()} quotes across the 6 core trunk routes),
          we compare what the traditional manual CPI methodology sees (a single static snapshot per month per route)
          versus AeroCPI&apos;s true continuous time-weighted daily average.
        </p>
      </div>

      {/* Metric Highlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Basket Mean Distortion */}
        <div className="bg-panel border border-line p-4 rounded-sm">
          <span className="font-mono text-[10px] text-text-dim block uppercase">
            Basket Mean Absolute Distortion
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl md:text-3xl font-bold text-accent-amber">
              {basket_summary.mean_absolute_divergence_pct.toFixed(1)}%
            </span>
            <span className="text-[11px] font-mono text-text-dim">
              ({basket_summary.mean_signed_divergence_pct > 0 ? "+" : ""}{basket_summary.mean_signed_divergence_pct.toFixed(1)}% bias)
            </span>
          </div>
          <p className="text-[11px] text-text-dim mt-2 leading-normal">
            The average measurement error introduced by taking only one price snapshot per route per month.
          </p>
        </div>

        {/* Card 2: Peak Route Divergence */}
        <div className="bg-panel border border-line p-4 rounded-sm">
          <span className="font-mono text-[10px] text-text-dim block uppercase">
            Peak Sector Distortion ({basket_summary.max_route})
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl md:text-3xl font-bold text-alert">
              {basket_summary.max_divergence_pct > 0 ? "+" : ""}
              {basket_summary.max_divergence_pct.toFixed(1)}%
            </span>
            <span className="text-[11px] font-mono text-text-dim">
              (volatile sector)
            </span>
          </div>
          <p className="text-[11px] text-text-dim mt-2 leading-normal">
            Highest absolute divergence between single-snapshot and continuous-average fare for any route in the basket.
          </p>
        </div>

        {/* Card 3: Minimum Distortion */}
        <div className="bg-panel border border-line p-4 rounded-sm">
          <span className="font-mono text-[10px] text-text-dim block uppercase">
            Minimum Sector Distortion ({basket_summary.min_route})
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl md:text-3xl font-bold text-signal-green">
              {basket_summary.min_divergence_pct > 0 ? "+" : ""}
              {basket_summary.min_divergence_pct.toFixed(1)}%
            </span>
            <span className="text-[11px] font-mono text-text-dim">
              (stable trunk)
            </span>
          </div>
          <p className="text-[11px] text-text-dim mt-2 leading-normal">
            Lowest absolute divergence between single-snapshot and continuous-average fare for any route in the basket.
          </p>
        </div>
      </div>

      {/* Per-Route Empirical Comparison Table */}
      <div className="border border-line bg-panel rounded-sm overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="font-mono text-[11px] text-text-dim border-b border-line bg-bg-void">
              <th className="py-2.5 px-4">SECTOR</th>
              <th className="py-2.5 px-3">SIMULATED MANUAL SNAPSHOT</th>
              <th className="py-2.5 px-3 text-right">SNAPSHOT FARE</th>
              <th className="py-2.5 px-3 text-right">AEROCPI CONTINUOUS AVG</th>
              <th className="py-2.5 px-3 text-right">SAMPLING SKEW (%)</th>
              <th className="py-2.5 px-4 text-right">OBSERVATIONS</th>
            </tr>
          </thead>
          <tbody className="font-mono divide-y divide-line/40">
            {routes.map((r) => {
              const skew = r.divergence_pct;
              const absSkew = r.abs_divergence_pct;
              const skewColor =
                absSkew > 10
                  ? "text-alert font-bold"
                  : absSkew > 3
                  ? "text-accent-amber font-bold"
                  : "text-signal-green";

              return (
                <tr key={r.route} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-4 font-bold text-text-primary">
                    {r.route}
                  </td>
                  <td className="py-2.5 px-3 text-text-dim">
                    <span className="text-text-primary font-semibold">{r.snapshot_details}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-text-dim tabular-nums">
                    ₹{r.snapshot_fare.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right text-signal-green font-semibold tabular-nums">
                    ₹{r.continuous_avg.toLocaleString()}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${skewColor}`}>
                    {skew > 0 ? `+${skew.toFixed(1)}%` : `${skew.toFixed(1)}%`}
                  </td>
                  <td className="py-2.5 px-4 text-right text-text-dim tabular-nums">
                    <span>{r.sample_size}</span>{" "}
                    <span className="text-[10px] text-signal-green">
                      ({r.live_quotes > 0 ? `${r.live_quotes} LIVE` : "SEEDED"})
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Methodology & Honesty Note */}
      <div className="border border-line bg-bg-void/80 p-3.5 rounded-sm space-y-1.5 text-[11px] font-mono text-text-dim">
        <div className="flex items-center gap-2 text-accent-amber font-bold">
          <span>ℹ METHODOLOGY & DATA DISCLOSURE:</span>
        </div>
        <p className="leading-relaxed">
          • <strong className="text-text-primary">Snapshot Selection:</strong> Strictly the first chronological observation recorded for each sector <em>per advance window</em> (T+7, T+15, T+30) in {methodology.calendar_period} ({methodology.snapshot_rule}). Not hand-picked or optimized to maximize distortion.
        </p>
        <p className="leading-relaxed">
          • <strong className="text-text-primary">Continuous Tracking:</strong> Time-weighted daily average fare per route per advance window, then averaged across windows. Formula: <code className="text-accent-amber">{methodology.formula}</code>.
        </p>
        <p className="leading-relaxed">
          • <strong className="text-text-primary">Telemetry Mix:</strong> {provenance.disclosure}
        </p>
      </div>
    </div>
  );
}
