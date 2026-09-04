"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useDashboard } from "@/lib/dashboard-context";

interface HeatmapCell {
  route: string;
  window: string;
  avgFare: number;
  surge: boolean;
}

const ROUTES = ["DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "BLR-HYD", "MAA-DEL"];
const WINDOWS = ["T+7", "T+15", "T+30"];

export const HeatmapMatrix: React.FC = () => {
  const { token } = useAuth();
  const { surgeFilterActive } = useDashboard();
  const [data, setData] = useState<HeatmapCell[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    async function loadData() {
      try {
        setIsLoading(true);
        const res = await api.surgeStatus(token!);
        const mapped = res.surges.map((s: any) => ({
          route: s.route,
          window: s.window,
          avgFare: s.current_avg,
          surge: s.is_surge
        }));
        setData(mapped);
      } catch (err) {
        console.error("Failed to load heatmap data", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [token]);

  const getCellColor = (fare: number, surge: boolean) => {
    if (surge) return "bg-alert/20 border-alert text-alert";
    if (fare > 6000) return "bg-accent-amber/20 border-accent-amber text-accent-amber";
    if (fare > 4500) return "bg-[#C9A227]/10 border-line text-text-primary";
    return "bg-panel border-line text-text-dim";
  };

  return (
    <div className="bg-panel border border-line p-5 rounded-sm">
      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <div>
          <span className="font-mono text-xs text-accent-amber block">
            [ HEATMAP :: SECTOR CORRIDOR MATRIX ]
          </span>
          <h2 className="text-base font-semibold text-text-primary">
            Route × Advance Purchase Tariff Matrix
          </h2>
        </div>
        <span className="font-mono text-xs text-text-dim">INR MEDIAN QUOTE</span>
      </div>

      <div className="overflow-x-auto min-h-[250px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-[200px]">
            <span className="font-mono text-xs text-text-dim animate-pulse">LOADING HEATMAP DATA...</span>
          </div>
        ) : (
          <table className="w-full font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-line text-text-dim">
                <th className="text-left py-2 px-3">ROUTE</th>
                {WINDOWS.map((w) => (
                  <th key={w} className="text-center py-2 px-3 font-bold text-text-primary">
                    {w} WINDOW
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROUTES.map((route) => {
                const routeCells = data.filter(c => c.route === route);
                const isSurging = routeCells.some(c => c.surge);
                const isDimmed = surgeFilterActive && !isSurging;

                return (
                  <tr key={route} className={`border-b border-line/50 transition-opacity duration-300 ${isDimmed ? 'opacity-30' : 'hover:bg-white/[0.02]'}`}>
                    <td className="py-2.5 px-3 font-semibold text-text-primary">
                      <Link
                        href={`/dashboard/route/${route}`}
                        className={`transition-colors ${isDimmed ? 'text-text-dim' : 'hover:text-accent-amber hover:underline'}`}
                      >
                        {route} →
                      </Link>
                    </td>
                    {WINDOWS.map((win) => {
                      const cell = routeCells.find((c) => c.window === win);
                      const fare = cell ? cell.avgFare : 0;
                      const surge = cell ? cell.surge : false;
                      return (
                        <td key={win} className="p-1 text-center">
                          <div
                            className={`py-1.5 px-2 border rounded-sm transition-colors ${getCellColor(
                              fare,
                              surge,
                            )}`}
                          >
                            ₹ {fare.toLocaleString()}
                            {surge && (
                              <span className="ml-1 text-[10px] text-alert font-bold">
                                ▲ SURGE
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-line text-[11px] font-mono text-text-dim flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-panel border border-line inline-block" />{" "}
            Economy Base
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-accent-amber/20 border border-accent-amber inline-block" />{" "}
            Elevated
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-alert/20 border border-alert inline-block" />{" "}
            Spike / Surge
          </span>
        </div>
        <span>CLICK ROUTE FOR DETAIL VIEW</span>
      </div>
    </div>
  );
};
