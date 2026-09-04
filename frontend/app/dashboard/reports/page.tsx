"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, type FareQuoteRecord } from "@/lib/api";

const CORE_ROUTES = ["DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "BLR-HYD", "MAA-DEL"];
const ADVANCE_WINDOWS = ["T+7", "T+15", "T+30"];

const ALL_SOURCES = [
  { key: "indigo", label: "IndiGo", type: "Airline" },
  { key: "akasa", label: "Akasa Air", type: "Airline" },
  { key: "spicejet", label: "SpiceJet", type: "Airline" },
  { key: "easemytrip", label: "EaseMyTrip", type: "OTA" },
  { key: "cleartrip", label: "Cleartrip", type: "OTA" },
  { key: "makemytrip", label: "MakeMyTrip", type: "OTA" },
] as const;

export default function ReportsPage() {
  const { token } = useAuth();
  const [quotes, setQuotes] = useState<FareQuoteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active filters
  const [selectedRoute, setSelectedRoute] = useState<string>("all");
  const [selectedWindow, setSelectedWindow] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedSourceType, setSelectedSourceType] = useState<string>("all");

  useEffect(() => {
    if (!token) return;
    async function loadFares() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.rawFares(token!, { limit: 500 });
        setQuotes(res.quotes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load telemetry quotes.");
      } finally {
        setIsLoading(false);
      }
    }
    loadFares();
  }, [token]);

  // Filtered quotes based on user selection
  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      if (selectedRoute !== "all" && q.route !== selectedRoute) return false;
      if (selectedWindow !== "all" && q.window !== selectedWindow) return false;
      if (selectedSource !== "all" && q.source.toLowerCase() !== selectedSource.toLowerCase()) return false;
      if (selectedSourceType !== "all" && q.source_type !== selectedSourceType) return false;
      return true;
    });
  }, [quotes, selectedRoute, selectedWindow, selectedSource, selectedSourceType]);

  // Section 1: Source Reliability Scorecard
  const sourceScorecard = useMemo(() => {
    return ALL_SOURCES.map((src) => {
      const srcQuotes = quotes.filter((q) => q.source.toLowerCase() === src.key.toLowerCase());
      const total = srcQuotes.length;
      const live = srcQuotes.filter((q) => q.source_type === "live").length;
      const seeded = srcQuotes.filter((q) => q.source_type === "seeded").length;
      const livePct = total > 0 ? ((live / total) * 100).toFixed(1) : "0.0";
      const seededPct = total > 0 ? ((seeded / total) * 100).toFixed(1) : "0.0";

      // Find latest live capture timestamp
      const liveQuotes = srcQuotes.filter((q) => q.source_type === "live");
      let lastLiveTimestamp: string | null = null;
      if (liveQuotes.length > 0) {
        const sorted = [...liveQuotes].sort(
          (a, b) => new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime()
        );
        lastLiveTimestamp = sorted[0].scraped_at;
      }

      return {
        ...src,
        total,
        live,
        seeded,
        livePct,
        seededPct,
        lastLiveTimestamp,
      };
    });
  }, [quotes]);

  // Section 2 & 3: Route x Window aggregations (Price Differential & Source Comparison)
  const routeWindowAggregates = useMemo(() => {
    const rows: Array<{
      route: string;
      window: string;
      sourceAverages: Record<string, number>;
      minFare: number | null;
      minSource: string | null;
      maxFare: number | null;
      maxSource: string | null;
      spreadINR: number | null;
      spreadPct: number | null;
    }> = [];

    const activeRoutes = selectedRoute !== "all" ? [selectedRoute] : CORE_ROUTES;
    const activeWindows = selectedWindow !== "all" ? [selectedWindow] : ADVANCE_WINDOWS;

    for (const r of activeRoutes) {
      for (const w of activeWindows) {
        const matched = quotes.filter((q) => q.route === r && q.window === w);

        const sourceAverages: Record<string, number> = {};
        for (const s of ALL_SOURCES) {
          const sQuotes = matched.filter((q) => q.source.toLowerCase() === s.key.toLowerCase());
          if (sQuotes.length > 0) {
            const avg = sQuotes.reduce((acc, cur) => acc + cur.total_fare, 0) / sQuotes.length;
            sourceAverages[s.key] = Math.round(avg);
          }
        }

        const validEntries = Object.entries(sourceAverages);
        if (validEntries.length > 0) {
          validEntries.sort((a, b) => a[1] - b[1]);
          const minSource = validEntries[0][0];
          const minFare = validEntries[0][1];
          const maxSource = validEntries[validEntries.length - 1][0];
          const maxFare = validEntries[validEntries.length - 1][1];
          const spreadINR = maxFare - minFare;
          const spreadPct = minFare > 0 ? ((spreadINR / minFare) * 100) : 0;

          rows.push({
            route: r,
            window: w,
            sourceAverages,
            minFare,
            minSource,
            maxFare,
            maxSource,
            spreadINR,
            spreadPct: Math.round(spreadPct * 10) / 10,
          });
        } else {
          rows.push({
            route: r,
            window: w,
            sourceAverages: {},
            minFare: null,
            minSource: null,
            maxFare: null,
            maxSource: null,
            spreadINR: null,
            spreadPct: null,
          });
        }
      }
    }

    return rows;
  }, [quotes, selectedRoute, selectedWindow]);

  // Section 4: Coverage Matrix (Source x Route x Window)
  const coverageMatrix = useMemo(() => {
    return CORE_ROUTES.flatMap((route) =>
      ADVANCE_WINDOWS.map((window) => {
        const rowKey = `${route} ${window}`;
        const sourceData: Record<
          string,
          { total: number; live: number; seeded: number }
        > = {};

        for (const s of ALL_SOURCES) {
          const matched = quotes.filter(
            (q) => q.route === route && q.window === window && q.source.toLowerCase() === s.key
          );
          sourceData[s.key] = {
            total: matched.length,
            live: matched.filter((m) => m.source_type === "live").length,
            seeded: matched.filter((m) => m.source_type === "seeded").length,
          };
        }

        return { route, window, rowKey, sourceData };
      })
    );
  }, [quotes]);

  // Section 5: CSV Export function
  const handleExportCSV = () => {
    if (filteredQuotes.length === 0) return;

    const headers = [
      "id",
      "route",
      "carrier",
      "flight_number",
      "window",
      "base_fare",
      "taxes",
      "udf",
      "convenience_fee",
      "total_fare",
      "currency",
      "source",
      "source_type",
      "scraped_at",
    ];

    const csvRows = [headers.join(",")];

    for (const q of filteredQuotes) {
      const row = [
        q.id,
        q.route,
        `"${q.carrier || ""}"`,
        `"${q.flight_number || ""}"`,
        q.window,
        q.base_fare ?? "",
        q.taxes ?? "",
        q.udf ?? "",
        q.convenience_fee ?? "",
        q.total_fare,
        q.currency || "INR",
        q.source,
        q.source_type,
        `"${q.scraped_at || ""}"`,
      ];
      csvRows.push(row.join(","));
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    link.setAttribute("download", `aerocpi_quotes_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 font-mono">
      {/* Breadcrumb + Report Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <Link href="/dashboard" className="hover:text-accent-amber transition-colors">
            DASHBOARD
          </Link>
          <span>/</span>
          <span className="text-accent-amber font-bold">REPORTS</span>
          <span>/</span>
          <span className="text-text-primary">SOURCE COVERAGE & TELEMETRY</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">
              [ TELEMETRY :: SOURCE COVERAGE & AUDIT REPORT ]
            </h1>
            <p className="text-xs text-text-dim mt-1">
              Cross-source parity across 3 Direct Airlines (IndiGo, Akasa, SpiceJet) and 3 OTAs (EaseMyTrip, Cleartrip, MakeMyTrip).
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              disabled={filteredQuotes.length === 0}
              className="px-3 py-1.5 bg-accent-amber/10 border border-accent-amber text-accent-amber hover:bg-accent-amber hover:text-bg-void transition-colors text-xs font-bold flex items-center gap-2 disabled:opacity-40"
              title="Download filtered quotes as normalized RFC 4180 CSV"
            >
              <span>⬇</span>
              <span>EXPORT CSV ({filteredQuotes.length} ROWS)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="bg-panel border border-line p-4 rounded-sm flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-accent-amber font-bold">FILTER SCOPE:</span>
        </div>

        {/* Route Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-text-dim">ROUTE:</span>
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="bg-bg-void border border-line text-text-primary px-2 py-1 rounded-sm outline-none"
          >
            <option value="all">ALL ROUTES ({CORE_ROUTES.length})</option>
            {CORE_ROUTES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Window Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-text-dim">WINDOW:</span>
          <select
            value={selectedWindow}
            onChange={(e) => setSelectedWindow(e.target.value)}
            className="bg-bg-void border border-line text-text-primary px-2 py-1 rounded-sm outline-none"
          >
            <option value="all">ALL WINDOWS (3)</option>
            {ADVANCE_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        {/* Source Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-text-dim">SOURCE:</span>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="bg-bg-void border border-line text-text-primary px-2 py-1 rounded-sm outline-none"
          >
            <option value="all">ALL 6 SOURCES</option>
            {ALL_SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label.toUpperCase()} [{s.type.toUpperCase()}]
              </option>
            ))}
          </select>
        </div>

        {/* Source Type Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-text-dim">PROVENANCE:</span>
          <select
            value={selectedSourceType}
            onChange={(e) => setSelectedSourceType(e.target.value)}
            className="bg-bg-void border border-line text-text-primary px-2 py-1 rounded-sm outline-none"
          >
            <option value="all">ALL DATA ORIGINS</option>
            <option value="live">LIVE ONLY</option>
            <option value="seeded">SEEDED ONLY</option>
          </select>
        </div>

        {/* Active quote count pill */}
        <div className="ml-auto text-text-dim text-[11px]">
          SHOWING <span className="text-text-primary font-bold">{filteredQuotes.length}</span> OF{" "}
          <span className="text-text-primary font-bold">{quotes.length}</span> QUOTES
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="text-xs text-text-dim animate-pulse">
            COMPUTING SOURCE COMPARISONS & AGGREGATING TELEMETRY...
          </span>
        </div>
      ) : error ? (
        <div className="border border-alert bg-alert/10 px-5 py-4 text-xs text-alert">
          {error}
        </div>
      ) : (
        <>
          {/* ============================================================ */}
          {/* SECTION 1: SOURCE RELIABILITY SCORECARD                      */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs text-accent-amber font-bold">
                [ 1. SOURCE RELIABILITY & PROVENANCE SCORECARD ]
              </span>
              <span className="text-[11px] text-text-dim">6 ACTIVE CAPTURE ENGINES</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sourceScorecard.map((s) => {
                const isAirline = s.type === "Airline";
                return (
                  <div
                    key={s.key}
                    className="bg-panel border border-line p-4 rounded-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-text-primary">{s.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 border rounded-xs ${
                            isAirline
                              ? "bg-accent-amber/10 border-accent-amber/30 text-accent-amber"
                              : "bg-signal-green/10 border-signal-green/30 text-signal-green"
                          }`}
                        >
                          {isAirline ? "AIRLINE DIRECT" : "OTA AGGREGATOR"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 my-3 text-[11px]">
                        <div className="bg-bg-void p-2 border border-line/50">
                          <span className="text-text-dim block text-[10px]">TOTAL CAPTURES</span>
                          <span className="text-base font-bold text-text-primary tabular-nums">
                            {s.total}
                          </span>
                        </div>
                        <div className="bg-bg-void p-2 border border-line/50">
                          <span className="text-text-dim block text-[10px]">PROVENANCE RATIO</span>
                          <span className="text-xs font-bold text-signal-green tabular-nums">
                            {s.livePct}% LIVE
                          </span>
                          <span className="text-[10px] text-accent-amber ml-1 tabular-nums">
                            / {s.seededPct}% SEEDED
                          </span>
                        </div>
                      </div>

                      {/* Visual Ratio Bar */}
                      <div className="w-full bg-bg-void h-1.5 rounded-full overflow-hidden flex border border-line/40 mb-3">
                        <div
                          style={{ width: `${s.livePct}%` }}
                          className="bg-signal-green h-full"
                          title={`${s.live} Live Captures`}
                        />
                        <div
                          style={{ width: `${s.seededPct}%` }}
                          className="bg-accent-amber/60 h-full"
                          title={`${s.seeded} Seeded Captures`}
                        />
                      </div>
                    </div>

                    {/* Last Live Capture Status */}
                    <div className="pt-2 border-t border-line/40 text-[10px] flex items-center justify-between">
                      <span className="text-text-dim">LAST LIVE CAPTURE:</span>
                      {s.lastLiveTimestamp ? (
                        <span className="text-signal-green font-bold">
                          {new Date(s.lastLiveTimestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      ) : (
                        <span className="text-text-dim italic">
                          AWAITING LIVE RUN (100% SEEDED)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECTION 2: PRICE DIFFERENTIAL ANALYSIS                      */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs text-accent-amber font-bold">
                [ 2. PRICE DIFFERENTIAL ANALYSIS :: CHEAPEST VS MOST EXPENSIVE ]
              </span>
              <span className="text-[11px] text-text-dim">
                ACROSS SECTORS & ADVANCE WINDOWS
              </span>
            </div>

            <div className="bg-panel border border-line rounded-sm overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line text-text-dim text-left">
                    <th className="py-2.5 px-4">SECTOR</th>
                    <th className="py-2.5 px-3">WINDOW</th>
                    <th className="py-2.5 px-3 text-right">CHEAPEST SOURCE</th>
                    <th className="py-2.5 px-3 text-right">MIN FARE</th>
                    <th className="py-2.5 px-3 text-right">HIGHEST SOURCE</th>
                    <th className="py-2.5 px-3 text-right">MAX FARE</th>
                    <th className="py-2.5 px-4 text-right">SPREAD (₹ / %)</th>
                  </tr>
                </thead>
                <tbody>
                  {routeWindowAggregates.map((row, idx) => {
                    const hasData = row.minFare !== null && row.maxFare !== null;
                    const spreadPct = row.spreadPct || 0;
                    const spreadColor =
                      spreadPct > 20
                        ? "text-alert font-bold"
                        : spreadPct > 10
                        ? "text-accent-amber font-bold"
                        : "text-signal-green";

                    return (
                      <tr
                        key={`${row.route}-${row.window}-${idx}`}
                        className="border-b border-line/40 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2.5 px-4 font-bold text-text-primary">{row.route}</td>
                        <td className="py-2.5 px-3 text-accent-amber font-semibold">
                          {row.window}
                        </td>
                        {hasData ? (
                          <>
                            <td className="py-2.5 px-3 text-right text-signal-green font-semibold uppercase">
                              {row.minSource}
                            </td>
                            <td className="py-2.5 px-3 text-right text-signal-green font-bold tabular-nums">
                              ₹{row.minFare?.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right text-text-dim uppercase">
                              {row.maxSource}
                            </td>
                            <td className="py-2.5 px-3 text-right text-text-primary tabular-nums">
                              ₹{row.maxFare?.toLocaleString()}
                            </td>
                            <td className={`py-2.5 px-4 text-right tabular-nums ${spreadColor}`}>
                              +₹{row.spreadINR?.toLocaleString()} ({row.spreadPct}%)
                            </td>
                          </>
                        ) : (
                          <td colSpan={5} className="py-2.5 px-4 text-center text-text-dim italic">
                            NO QUOTES MATCHING CURRENT FILTER
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECTION 3: SOURCE COMPARISON TABLE                          */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs text-accent-amber font-bold">
                [ 3. CROSS-SOURCE FARE COMPARISON MATRIX ]
              </span>
              <span className="text-[11px] text-text-dim">
                AVERAGE FARE PER ROUTE × WINDOW × SOURCE
              </span>
            </div>

            <div className="bg-panel border border-line rounded-sm overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line text-text-dim text-left">
                    <th className="py-2.5 px-3">ROUTE</th>
                    <th className="py-2.5 px-2">WINDOW</th>
                    {ALL_SOURCES.map((s) => (
                      <th key={s.key} className="py-2.5 px-3 text-right uppercase">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {routeWindowAggregates.map((row, idx) => {
                    return (
                      <tr
                        key={`comp-${row.route}-${row.window}-${idx}`}
                        className="border-b border-line/40 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2.5 px-3 font-bold text-text-primary">{row.route}</td>
                        <td className="py-2.5 px-2 text-accent-amber">{row.window}</td>
                        {ALL_SOURCES.map((s) => {
                          const avg = row.sourceAverages[s.key];
                          const isMin = row.minFare !== null && avg === row.minFare;
                          return (
                            <td
                              key={s.key}
                              className={`py-2.5 px-3 text-right tabular-nums ${
                                isMin
                                  ? "text-signal-green font-bold bg-signal-green/[0.04]"
                                  : avg
                                  ? "text-text-primary"
                                  : "text-text-dim italic"
                              }`}
                            >
                              {avg ? `₹${avg.toLocaleString()}` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-text-dim flex justify-between px-1">
              <span>* Highlighted cells indicate lowest average fare for that sector and window.</span>
              <span className="text-signal-green">GREEN = BEST SECTOR RATE</span>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECTION 4: COVERAGE MATRIX                                  */}
          {/* ============================================================ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs text-accent-amber font-bold">
                [ 4. SOURCE COVERAGE & GAP DETECTION MATRIX ]
              </span>
              <span className="text-[11px] text-text-dim">
                CAPTURED DATA AVAILABILITY (6 SOURCES × 18 BASKET COMBINATIONS)
              </span>
            </div>

            <div className="bg-panel border border-line rounded-sm overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line text-text-dim text-left">
                    <th className="py-2.5 px-4">SECTOR & WINDOW</th>
                    {ALL_SOURCES.map((s) => (
                      <th key={s.key} className="py-2.5 px-3 text-center uppercase">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coverageMatrix.map((item) => {
                    return (
                      <tr
                        key={item.rowKey}
                        className="border-b border-line/40 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2 px-4 text-text-primary">
                          <span className="font-bold mr-2">{item.route}</span>
                          <span className="text-accent-amber text-[11px]">{item.window}</span>
                        </td>
                        {ALL_SOURCES.map((s) => {
                          const data = item.sourceData[s.key];
                          const hasData = data && data.total > 0;
                          return (
                            <td key={s.key} className="py-2 px-3 text-center text-[11px]">
                              {hasData ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs font-bold ${
                                    data.live > 0
                                      ? "bg-signal-green/10 text-signal-green border border-signal-green/30"
                                      : "bg-accent-amber/10 text-accent-amber border border-accent-amber/30"
                                  }`}
                                >
                                  {data.total} {data.live > 0 ? "LIVE" : "SEEDED"}
                                </span>
                              ) : (
                                <span className="text-alert/60 font-mono text-[10px]">
                                  [GAP] 0
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-text-dim flex justify-between px-1">
              <span>* Any cell labeled [GAP] highlights an uncollected source/route/window coordinate.</span>
              <span className="text-text-dim">TOTAL AUDITED COORDINATES: 108</span>
            </div>
          </div>
        </>
      )}

      {/* Footer Navigation Back */}
      <div className="pt-4 border-t border-line flex items-center justify-between text-xs">
        <Link href="/dashboard" className="text-accent-amber hover:underline flex items-center gap-1">
          <span>←</span>
          <span>RETURN TO LIVE DASHBOARD</span>
        </Link>
        <span className="text-text-dim">AEROCPI PROTOCOL SPEC :: MULTI-SOURCE INTEGRITY</span>
      </div>
    </div>
  );
}
