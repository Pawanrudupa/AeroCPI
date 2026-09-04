"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { api, type IndexRouteRecord, type FareQuoteRecord } from "@/lib/api";
import { QuoteTable } from "@/components/QuoteTable";
import { TrendIndicator } from "@/components/TrendIndicator";

const DGCA_ROUTE_WEIGHTS: Record<string, number> = {
  "DEL-BOM": 0.24,
  "DEL-BLR": 0.20,
  "BOM-BLR": 0.18,
  "DEL-CCU": 0.15,
  "BLR-HYD": 0.12,
  "MAA-DEL": 0.11,
};

/**
 * /dashboard/route/[pair] — Per-route detail view.
 *
 * Shows full fare history and window breakdown for a specific city-pair
 * (e.g. DEL-BOM). Data fetched from:
 *   - GET /index/route/{pair}
 *   - GET /fares/raw?route={pair}
 */
export default function RouteDetailPage() {
  const params = useParams();
  const pair = (params.pair as string || "").toUpperCase();
  const { token } = useAuth();

  const [routeIndex, setRouteIndex] = useState<IndexRouteRecord[]>([]);
  const [routeFares, setRouteFares] = useState<FareQuoteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !pair) return;
    const t = token;

    async function loadRouteData() {
      setIsLoading(true);
      setError(null);

      try {
        const [indexRes, faresRes] = await Promise.allSettled([
          api.routeIndex(t, pair),
          api.rawFares(t, { route: pair, limit: 200 }),
        ]);

        if (indexRes.status === "fulfilled") {
          setRouteIndex(indexRes.value.data);
        }
        if (faresRes.status === "fulfilled") {
          setRouteFares(faresRes.value.quotes);
        }

        if (indexRes.status === "rejected" && faresRes.status === "rejected") {
          setError("No data available for this route.");
        }
      } catch {
        setError("Failed to fetch route data.");
      } finally {
        setIsLoading(false);
      }
    }

    loadRouteData();
  }, [token, pair]);

  /* Group fares by window and source for comparison and component breakdown */
  const faresByWindow: Record<string, FareQuoteRecord[]> = {};
  routeFares.forEach((f) => {
    if (!faresByWindow[f.window]) faresByWindow[f.window] = [];
    faresByWindow[f.window].push(f);
  });

  const windowStats = Object.entries(faresByWindow).map(([window, fares]) => {
    const avg = fares.reduce((sum, f) => sum + f.total_fare, 0) / fares.length;
    const liveCount = fares.filter((f) => f.source_type === "live").length;
    const seededCount = fares.filter((f) => f.source_type === "seeded").length;
    
    // Source breakdown
    const sourceMap: Record<string, { base: number, taxes: number, count: number, total: number }> = {};
    fares.forEach(f => {
      const src = f.source.toUpperCase();
      if (!sourceMap[src]) sourceMap[src] = { base: 0, taxes: 0, count: 0, total: 0 };
      sourceMap[src].base += (f.base_fare || 0);
      sourceMap[src].taxes += ((f.taxes || 0) + (f.udf || 0) + (f.convenience_fee || 0));
      sourceMap[src].total += f.total_fare;
      sourceMap[src].count += 1;
    });
    
    const sourceAverages = Object.entries(sourceMap).map(([src, data]) => ({
      source: src,
      avgBase: data.count ? data.base / data.count : 0,
      avgTaxes: data.count ? data.taxes / data.count : 0,
      avgTotal: data.count ? data.total / data.count : 0,
    }));
    
    const minSourceTotal = Math.min(...sourceAverages.map(s => s.avgTotal).filter(v => v > 0));

    return { 
      window, 
      avg: Math.round(avg), 
      count: fares.length, 
      liveCount, 
      seededCount,
      sources: sourceAverages,
      minSourceTotal
    };
  });

  return (
    <div className="space-y-8">
      {/* Breadcrumb + Route Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-mono text-xs text-text-dim">
              <Link
                href="/dashboard"
                className="hover:text-accent-amber transition-colors"
              >
                DASHBOARD
              </Link>
              <span>/</span>
              <span className="text-text-primary">ROUTE</span>
              <span>/</span>
              <span className="text-accent-amber font-bold">{pair}</span>
            </div>

            <div className="flex items-center gap-4">
              <h1 className="text-xl md:text-2xl font-bold font-mono text-text-primary">
                [ SECTOR ANALYSIS :: {pair} ]
              </h1>
              {DGCA_ROUTE_WEIGHTS[pair] && (
                <span className="font-mono text-xs px-2 py-1 bg-white/5 border border-line text-text-dim rounded-sm">
                  DGCA WEIGHT: {(DGCA_ROUTE_WEIGHTS[pair] * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          
          {routeFares.length > 0 && (
            <TrendIndicator fares={routeFares} />
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="font-mono text-xs text-text-dim animate-pulse">
            LOADING SECTOR DATA...
          </span>
        </div>
      ) : error ? (
        <div className="border border-alert bg-alert/10 px-5 py-4 text-xs font-mono text-alert">
          {error}
        </div>
      ) : (
        <>
          {/* Window Breakdown & Source Comparison */}
          <div className="space-y-4">
            <div className="border-b border-line pb-2">
              <span className="font-mono text-xs text-accent-amber block">
                [ SOURCE COMPARISON & FARE COMPONENTS ]
              </span>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {windowStats.map((w) => (
                <div
                  key={w.window}
                  className="border border-line bg-panel p-5 font-mono flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[10px] text-text-dim block">
                        {w.window} WINDOW AVERAGE
                      </span>
                      <span className="text-xl font-bold text-accent-amber">
                        ₹{w.avg.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1 text-[10px]">
                      <span className="text-text-dim">
                        {w.count} CAPTURES
                      </span>
                      {w.liveCount > 0 && <span className="text-signal-green px-1.5 py-0.5 bg-signal-green/10 border border-signal-green/20">{w.liveCount} LIVE</span>}
                      {w.seededCount > 0 && <span className="text-accent-amber px-1.5 py-0.5 bg-accent-amber/10 border border-accent-amber/20">{w.seededCount} SEEDED</span>}
                    </div>
                  </div>

                  <div className="mt-auto space-y-2">
                    <div className="text-[10px] text-text-dim border-b border-line/40 pb-1 mb-2">
                      SOURCE BREAKDOWN
                    </div>
                    {w.sources.map((src) => {
                      const isCheapest = src.avgTotal > 0 && src.avgTotal === w.minSourceTotal;
                      return (
                        <div key={src.source} className={`p-2 rounded-sm text-xs ${isCheapest ? "bg-signal-green/10 border border-signal-green/30" : "bg-bg-void border border-line/40"}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className={isCheapest ? "text-signal-green font-bold" : "text-text-primary font-bold"}>{src.source}</span>
                            <span className={isCheapest ? "text-signal-green font-bold" : "text-text-primary"}>₹{Math.round(src.avgTotal).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-text-dim">
                            <span>Base: ₹{Math.round(src.avgBase).toLocaleString()}</span>
                            <span>Taxes/Fees: ₹{Math.round(src.avgTaxes).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Route Index Chart */}
          {routeIndex.length > 0 && (
            <div className="bg-panel border border-line p-5 rounded-sm">
              <div className="border-b border-line pb-3 mb-4">
                <span className="font-mono text-xs text-accent-amber block">
                  [ INDEX :: ROUTE PRICE TREND ]
                </span>
                <h2 className="text-base font-semibold text-text-primary">
                  {pair} — Average Fare & Index Value
                </h2>
              </div>

              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={routeIndex}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="#262316"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke="#8A8672"
                      fontSize={11}
                      fontFamily="JetBrains Mono"
                      tickLine={false}
                      tickFormatter={(val: string) => val.slice(5)}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#8A8672"
                      fontSize={11}
                      fontFamily="JetBrains Mono"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `₹${v}`}
                      domain={['auto', 'auto']}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#8A8672"
                      fontSize={11}
                      fontFamily="JetBrains Mono"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => v.toFixed(0)}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#12120C",
                        borderColor: "#262316",
                        color: "#E8E4D4",
                        fontFamily: "JetBrains Mono",
                        fontSize: "12px",
                      }}
                      formatter={(value: number, name: string) => [
                        name === "avg_total_fare"
                          ? `₹${value.toLocaleString()}`
                          : value.toFixed(2),
                        name === "avg_total_fare"
                          ? "Avg Fare"
                          : "Index Value",
                      ]}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="avg_total_fare"
                      stroke="#C9A227"
                      strokeWidth={2}
                      dot={{ fill: "#C9A227", r: 3 }}
                      name="avg_total_fare"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="index_value"
                      stroke="#7FB86B"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ fill: "#7FB86B", r: 3 }}
                      name="index_value"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Full Fare Table for this Route */}
          {routeFares.length > 0 && (
            <QuoteTable quotes={routeFares} />
          )}
        </>
      )}

      {/* Back link */}
      <div className="pt-4">
        <Link
          href="/dashboard"
          className="font-mono text-xs text-accent-amber hover:underline"
        >
          ← BACK TO DASHBOARD
        </Link>
      </div>
    </div>
  );
}
