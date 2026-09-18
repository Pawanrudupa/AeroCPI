"use client";

import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { api, type ElasticityWindowRecord } from "@/lib/api";

interface ElasticityCurveProps {
  token?: string | null;
}

export const ElasticityCurve: React.FC<ElasticityCurveProps> = ({ token }) => {
  const [data, setData] = useState<ElasticityWindowRecord[]>([]);
  const [spreadPct, setSpreadPct] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchElasticity() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await api.elasticity(token);
        if (!isMounted) return;
        if (res.status === "insufficient_data") {
          setErrorMsg(res.message || "Insufficient data for elasticity curve.");
          setData([]);
          setSpreadPct(null);
        } else if (res.windows && res.windows.length > 0) {
          setData(res.windows);
          setSpreadPct(res.spread_pct ?? null);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg("Failed to load elasticity data from API.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchElasticity();
    return () => { isMounted = false; };
  }, [token]);

  const spreadLabel =
    spreadPct !== null
      ? `${spreadPct >= 0 ? "+" : ""}${spreadPct}% T+30 → T+7`
      : "—";

  return (
    <div className="bg-panel border border-line p-5 rounded-sm">
      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <div>
          <span className="font-mono text-xs text-accent-amber block">[ ELASTICITY :: LEAD-TIME DYNAMICS ]</span>
          <h2 className="text-base font-semibold text-text-primary">
            Booking Window Elasticity Curve
          </h2>
        </div>
        {!isLoading && !errorMsg && data.length > 0 && (
          <span className="font-mono text-xs text-signal-green">{spreadLabel}</span>
        )}
      </div>

      <div className="h-[240px] w-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <span className="font-mono text-xs text-text-dim animate-pulse">LOADING ELASTICITY DATA...</span>
          </div>
        ) : errorMsg || data.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <span className="font-mono text-xs text-accent-amber block mb-2">INSUFFICIENT DATA</span>
              <span className="font-mono text-[11px] text-text-dim block max-w-xs">
                {errorMsg || "Not enough advance-window quotes to compute an elasticity curve."}
              </span>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="elasticityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C9A227" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#C9A227" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#262316" strokeDasharray="3 3" vertical={false} />
              <XAxis
                type="number"
                domain={["dataMin", "dataMax"]}
                dataKey="days_to_departure"
                stroke="#8A8672"
                fontSize={11}
                fontFamily="JetBrains Mono"
                tickLine={false}
                tickFormatter={(v) => `T+${v}`}
                reversed={false}
              />
              <YAxis
                type="number"
                stroke="#8A8672"
                fontSize={11}
                fontFamily="JetBrains Mono"
                domain={["dataMin - 200", "dataMax + 200"]}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#12120C",
                  borderColor: "#262316",
                  color: "#E8E4D4",
                  fontFamily: "JetBrains Mono",
                  fontSize: "12px",
                }}
                formatter={(value: any) => [
                  `₹${Number(value).toLocaleString()}`,
                  "Median Basket Fare",
                ]}
                labelFormatter={(label) => `Advance Window: T+${label}`}
              />
              <Area
                type="monotone"
                dataKey="average_fare"
                stroke="#C9A227"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#elasticityGradient)"
                dot={{ fill: "#C9A227", r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-line text-xs font-mono text-text-dim flex justify-between">
        {data.length > 0 ? (
          <>
            <span>
              COMPUTED FROM {data.reduce((sum, d) => sum + d.sample_size, 0)} REAL QUOTES
            </span>
            <span className="text-text-primary">BASE: T+30 = 100.0</span>
          </>
        ) : (
          <span>AWAITING SUFFICIENT ADVANCE-WINDOW FARE DATA</span>
        )}
      </div>
    </div>
  );
};
