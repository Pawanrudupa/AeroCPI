"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { api, API_BASE } from "@/lib/api";
import { LiveTrendChart } from "@/components/LiveTrendChart";
import { HeatmapMatrix } from "@/components/HeatmapMatrix";
import { ElasticityCurve } from "@/components/ElasticityCurve";
import { QuoteTable, type DisplayQuote } from "@/components/QuoteTable";
import { PipelineLogConsole } from "@/components/PipelineLogConsole";

/**
 * /dashboard — Main data application page.
 *
 * Contains all data visualizations:
 *   - Daily index metric (AeroCPI vs DGCA benchmark)
 *   - Route × Window heatmap (with clickable routes → /dashboard/route/[pair])
 *   - Booking window elasticity curve
 *   - Raw quote audit log with LIVE / SEEDED badges
 *
 * Auth-gated via the dashboard layout.
 */
export default function DashboardPage() {
  const { token } = useAuth();

  const [quotes, setQuotes] = useState<DisplayQuote[]>([]);
  const [indexSummary, setIndexSummary] = useState<{
    latest: number | null;
    change: string;
    count: number;
  }>({ latest: null, change: "—", count: 0 });
  const [backtestSummary, setBacktestSummary] = useState<{
    correlation: number | null;
    trackingError: number | null;
    status: string;
    message: string;
  }>({
    correlation: null,
    trackingError: null,
    status: "pending",
    message: "Awaiting MoSPI calendar overlap",
  });

  /* Load data from backend on mount */
  useEffect(() => {
    if (!token) return;
    const t = token; // capture non-null for closures

    async function loadData() {
      try {
        /* Fetch raw fares */
        const faresRes = await api.rawFares(t, { limit: 100 });
        const mapped: DisplayQuote[] = faresRes.quotes.map((q) => ({
          id: q.id,
          route: q.route,
          carrier: q.carrier,
          flight_number: q.flight_number,
          window: q.window,
          base_fare: q.base_fare,
          taxes: q.taxes,
          udf: q.udf,
          convenience_fee: q.convenience_fee,
          total_fare: q.total_fare,
          source: q.source,
          source_type: q.source_type,
          scraped_at: q.scraped_at,
        }));
        setQuotes(mapped);
      } catch {
        /* API may be offline — leave empty, charts render defaults */
      }

      try {
        /* Fetch daily index for summary metrics */
        const indexRes = await api.dailyIndex(t);
        if (indexRes.data.length > 0) {
          const latest = indexRes.data[indexRes.data.length - 1];
          const base = indexRes.data[0];
          const pctChange =
            base.index_value > 0
              ? (
                  ((latest.index_value - base.index_value) /
                    base.index_value) *
                  100
                ).toFixed(1)
              : "—";
          setIndexSummary({
            latest: latest.index_value,
            change: `${Number(pctChange) >= 0 ? "+" : ""}${pctChange}%`,
            count: indexRes.count,
          });
        }
      } catch {
        /* leave defaults */
      }

      try {
        /* Fetch backtest metrics */
        const btRes = await api.backtest(t);
        if (btRes) {
          setBacktestSummary({
            correlation: btRes.correlation ?? null,
            trackingError: btRes.tracking_error ?? null,
            status: btRes.status || "pending",
            message: btRes.message || "Awaiting MoSPI calendar overlap",
          });
        }
      } catch {
        /* leave defaults */
      }
    }

    loadData();
  }, [token]);

  return (
    <div className="space-y-8">
      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
        <div className="border border-line bg-panel p-4">
          <span className="text-[10px] text-text-dim block">
            DAILY AEROCPI INDEX
          </span>
          <span className="text-xl md:text-2xl font-bold text-accent-amber">
            {indexSummary.latest !== null
              ? indexSummary.latest.toFixed(2)
              : "—"}
          </span>
          <span className="text-[10px] text-signal-green block">
            {indexSummary.change} from base
          </span>
        </div>
        <div className="border border-line bg-panel p-4">
          <span className="text-[10px] text-text-dim block">
            BENCHMARK OVERLAP (MoSPI)
          </span>
          <span
            className={`text-xl md:text-2xl font-bold ${
              backtestSummary.correlation !== null
                ? "text-signal-green"
                : "text-accent-amber"
            }`}
          >
            {backtestSummary.correlation !== null
              ? `r: ${backtestSummary.correlation.toFixed(3)}`
              : "PENDING"}
          </span>
          <span
            className="text-[10px] text-text-dim block truncate"
            title={backtestSummary.message}
          >
            {backtestSummary.correlation !== null
              ? `RMSE: ${backtestSummary.trackingError?.toFixed(2) ?? "—"}`
              : "AWAITING RELEASE"}
          </span>
        </div>
        <div className="border border-line bg-panel p-4">
          <span className="text-[10px] text-text-dim block">
            INDEX SERIES
          </span>
          <span className="text-xl md:text-2xl font-bold text-text-primary">
            {indexSummary.count}
          </span>
          <span className="text-[10px] text-text-dim block">
            DAILY POINTS
          </span>
        </div>
        <div className="border border-line bg-panel p-4">
          <span className="text-[10px] text-text-dim block">
            QUOTE RECORDS
          </span>
          <span className="text-xl md:text-2xl font-bold text-text-primary">
            {quotes.length}
          </span>
          <span className="text-[10px] text-text-dim block">
            CAPTURED FARES
          </span>
        </div>
      </div>

      {/* Row 1: AeroCPI vs DGCA/MoSPI Benchmark Line Chart */}
      <LiveTrendChart
        token={token}
        correlation={backtestSummary.correlation}
        trackingError={backtestSummary.trackingError}
      />

      {/* Row 2: Heatmap Matrix & Elasticity Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7">
          <HeatmapMatrix />
        </div>
        <div className="lg:col-span-5">
          <ElasticityCurve token={token} />
        </div>
      </div>

      {/* Row 3: Raw Quote Audit Log */}
      <QuoteTable quotes={quotes} />

      {/* Row 4: Live Pipeline Event Log */}
      <PipelineLogConsole />
    </div>
  );
}
