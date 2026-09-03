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

  /* Group fares by window for the breakdown table */
  const faresByWindow: Record<string, FareQuoteRecord[]> = {};
  routeFares.forEach((f) => {
    if (!faresByWindow[f.window]) faresByWindow[f.window] = [];
    faresByWindow[f.window].push(f);
  });

  const avgByWindow = Object.entries(faresByWindow).map(([window, fares]) => {
    const avg =
      fares.reduce((sum, f) => sum + f.total_fare, 0) / fares.length;
    const liveCount = fares.filter((f) => f.source_type === "live").length;
    const seededCount = fares.filter((f) => f.source_type === "seeded").length;
    return { window, avg: Math.round(avg), count: fares.length, liveCount, seededCount };
  });

  return (
    <div className="space-y-8">
      {/* Breadcrumb + Route Header */}
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

        <h1 className="text-xl md:text-2xl font-bold font-mono text-text-primary">
          [ SECTOR ANALYSIS :: {pair} ]
        </h1>
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
          {/* Window Breakdown Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {avgByWindow.map((w) => (
              <div
                key={w.window}
                className="border border-line bg-panel p-5 font-mono"
              >
                <span className="text-[10px] text-text-dim block">
                  {w.window} WINDOW
                </span>
                <span className="text-xl font-bold text-accent-amber">
                  ₹{w.avg.toLocaleString()}
                </span>
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  <span className="text-signal-green">
                    {w.liveCount} LIVE
                  </span>
                  {w.seededCount > 0 && (
                    <span className="text-accent-amber">
                      {w.seededCount} SEEDED
                    </span>
                  )}
                  <span className="text-text-dim">
                    ({w.count} TOTAL)
                  </span>
                </div>
              </div>
            ))}
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
                      stroke="#8A8672"
                      fontSize={11}
                      fontFamily="JetBrains Mono"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `₹${v}`}
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
                        name === "avg_fare"
                          ? `₹${value.toLocaleString()}`
                          : value.toFixed(2),
                        name === "avg_fare"
                          ? "Avg Fare"
                          : "Index Value",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg_fare"
                      stroke="#C9A227"
                      strokeWidth={2}
                      dot={{ fill: "#C9A227", r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="index_value"
                      stroke="#7FB86B"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ fill: "#7FB86B", r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Full Fare Table for this Route */}
          {routeFares.length > 0 && (
            <div className="bg-panel border border-line p-5 rounded-sm">
              <div className="border-b border-line pb-3 mb-4">
                <span className="font-mono text-xs text-accent-amber block">
                  [ TELEMETRY :: {pair} FARE LOG ]
                </span>
                <h2 className="text-base font-semibold text-text-primary">
                  All Captured Quotes — {routeFares.length} Records
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-line text-text-dim text-left">
                      <th className="py-2 px-3">ORIGIN</th>
                      <th className="py-2 px-3">CARRIER</th>
                      <th className="py-2 px-3">FLIGHT</th>
                      <th className="py-2 px-3">WINDOW</th>
                      <th className="py-2 px-3 text-right">BASE</th>
                      <th className="py-2 px-3 text-right">TAXES</th>
                      <th className="py-2 px-3 text-right">TOTAL</th>
                      <th className="py-2 px-3">SOURCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeFares.slice(0, 30).map((q) => {
                      const isLive = q.source_type === "live";
                      const taxes =
                        (q.taxes || 0) + (q.udf || 0) + (q.convenience_fee || 0);
                      return (
                        <tr
                          key={q.id}
                          className="border-b border-line/40 hover:bg-white/[0.02]"
                        >
                          <td className="py-2 px-3">
                            {isLive ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-signal-green/10 text-signal-green border border-signal-green/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
                                LIVE
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-accent-amber/10 text-accent-amber border border-accent-amber/30">
                                SEEDED
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-text-primary">
                            {q.carrier}
                          </td>
                          <td className="py-2 px-3 text-text-dim">
                            {q.flight_number}
                          </td>
                          <td className="py-2 px-3 text-accent-amber font-semibold">
                            {q.window}
                          </td>
                          <td className="py-2 px-3 text-right text-text-dim">
                            {q.base_fare ? `₹${q.base_fare.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right text-text-dim">
                            {taxes > 0 ? `₹${taxes.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-text-primary">
                            ₹{q.total_fare.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-text-dim uppercase text-[10px]">
                            {q.source}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {routeFares.length > 30 && (
                <div className="mt-3 pt-3 border-t border-line text-[11px] font-mono text-text-dim">
                  SHOWING 30 OF {routeFares.length} — FULL DATASET AVAILABLE VIA API
                </div>
              )}
            </div>
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
