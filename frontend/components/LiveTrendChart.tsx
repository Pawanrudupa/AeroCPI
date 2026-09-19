"use client";

import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { api } from "@/lib/api";

interface TrendPoint {
  date: string;
  aerocpi: number;
  mospi: number | null;
  hasSeeded?: boolean;
}

interface LiveTrendChartProps {
  token?: string | null;
  data?: TrendPoint[];
  correlation?: number | null;
  trackingError?: number | null;
}

export type Frequency = "daily" | "weekly" | "monthly";

export const LiveTrendChart: React.FC<LiveTrendChartProps> = ({
  token,
  data: propData,
  correlation = null,
  trackingError = null,
}) => {
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [chartData, setChartData] = useState<TrendPoint[]>(propData || []);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!token) {
      if (propData && propData.length > 0) {
        setChartData(propData);
      } else {
        setChartData([]);
      }
      return;
    }

    let isMounted = true;
    async function fetchIndexByFrequency() {
      setIsLoading(true);
      try {
        if (frequency === "daily") {
          const res = await api.dailyIndex(token!);
          if (isMounted) {
            if (res.data && res.data.length > 0) {
              const mapped: TrendPoint[] = res.data.map((r) => ({
                date: r.date,
                aerocpi: r.index_value,
                mospi: null,
                hasSeeded: r.has_seeded_data,
              }));
              setChartData(mapped);
            } else {
              setChartData([]);
            }
          }
        } else if (frequency === "weekly") {
          const res = await api.weeklyIndex(token!);
          if (isMounted) {
            if (res.data && res.data.length > 0) {
              const mapped: TrendPoint[] = res.data.map((r) => ({
                date: r.period,
                aerocpi: r.index_value,
                mospi: null,
              }));
              setChartData(mapped);
            } else {
              setChartData([]);
            }
          }
        } else if (frequency === "monthly") {
          const res = await api.monthlyIndex(token!);
          if (isMounted) {
            if (res.data && res.data.length > 0) {
              const mapped: TrendPoint[] = res.data.map((r) => ({
                date: r.period,
                aerocpi: r.index_value,
                mospi: r.mospi_cpi ?? null,
              }));
              setChartData(mapped);
            } else {
              setChartData([]);
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setChartData([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchIndexByFrequency();
    return () => {
      isMounted = false;
    };
  }, [frequency, token, propData]);

  const hasMospiData = chartData.some(
    (d) => d.mospi !== null && d.mospi !== undefined
  );

  const formatXAxisTick = (val: string) => {
    if (!val) return "";
    if (frequency === "monthly") {
      const parts = val.split("-");
      if (parts.length >= 2) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const mIdx = parseInt(parts[1], 10) - 1;
        const monthName = months[mIdx] || parts[1];
        const yr = parts[0].slice(2);
        return `${monthName} '${yr}`;
      }
      return val;
    }
    if (frequency === "weekly") {
      return val;
    }
    return val.length > 5 ? val.slice(5) : val;
  };

  const methodLabel =
    frequency === "daily"
      ? "Daily GEKS-Törnqvist Multilateral Index (Base 100.0)"
      : frequency === "weekly"
      ? "Weekly Geometric Rollup of Daily GEKS-Törnqvist"
      : hasMospiData
      ? "Monthly Geometric Rollup vs. MoSPI CPI Div 07.3"
      : "Monthly Geometric Rollup of Daily GEKS-Törnqvist (Benchmark Pending)";

  return (
    <div className="bg-panel border border-line p-5 rounded-sm">
      <div className="flex flex-wrap items-center justify-between border-b border-line pb-3 mb-4 gap-4">
        <div>
          <span className="font-mono text-xs text-accent-amber block">[ METRICS :: MULTILATERAL INDEX TRACK ]</span>
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            AeroCPI vs. MoSPI CPI (Base 2024=100)
            {isLoading && (
              <span className="text-[10px] font-mono text-accent-amber animate-pulse">
                [UPDATING...]
              </span>
            )}
          </h2>
        </div>

        {/* Frequency Selector Toggle */}
        <div className="flex items-center gap-1 bg-[#16140D] p-1 border border-line rounded">
          {(["daily", "weekly", "monthly"] as const).map((freq) => (
            <button
              key={freq}
              type="button"
              onClick={() => setFrequency(freq)}
              className={`px-3 py-1 text-xs font-mono font-semibold uppercase transition-all rounded-sm ${
                frequency === freq
                  ? "bg-accent-amber text-[#0A0A07] shadow-sm font-bold"
                  : "text-text-dim hover:text-text-primary hover:bg-[#262316]"
              }`}
            >
              {freq}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1 font-mono text-[10px] mt-2 md:mt-0 md:text-right max-w-sm">
          <span className="text-accent-amber font-bold">
            {frequency === "monthly"
              ? hasMospiData
                ? "MOSPI COMPARISON ACTIVE"
                : "MONTHLY ROLLUP (BENCHMARK PENDING)"
              : "BACKTEST PENDING (Base 2024=100)"}
          </span>
          <span className="text-text-dim leading-tight">
            {frequency === "monthly"
              ? hasMospiData
                ? "Official MoSPI CPI Div 07.3 (Passenger transport services) superimposed over monthly rollup."
                : "Monthly geometric mean of daily multilateral index. MoSPI CPI Div 07.3 comparison pending published calendar overlap."
              : "No calendar overlap yet between captured index history and MoSPI CPI Base 2024=100. Toggle to Monthly for rollup."}
          </span>
        </div>
      </div>

      <div className="h-[280px] w-full relative">
        {isLoading && (
          <div className="absolute inset-0 bg-[#12120C]/80 backdrop-blur-[1px] flex items-center justify-center z-10 font-mono text-xs text-accent-amber animate-pulse">
            LOADING {frequency.toUpperCase()} INDEX SERIES...
          </div>
        )}
        {!isLoading && chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center border border-dashed border-line text-text-dim font-mono text-xs">
            AWAITING INDEX TELEMETRY FOR {frequency.toUpperCase()} SERIES
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#262316" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#8A8672"
                fontSize={11}
                fontFamily="JetBrains Mono"
                tickLine={false}
                tickFormatter={formatXAxisTick}
              />
              <YAxis
                stroke="#8A8672"
                fontSize={11}
                fontFamily="JetBrains Mono"
                domain={["dataMin - 2", "dataMax + 2"]}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#12120C",
                  borderColor: "#262316",
                  color: "#E8E4D4",
                  fontFamily: "JetBrains Mono",
                  fontSize: "12px",
                }}
                formatter={(value: any, name: string) => [
                  value !== null ? Number(value).toFixed(2) : "N/A",
                  name === "aerocpi"
                    ? frequency === "daily"
                      ? "AeroCPI (Daily GEKS)"
                      : frequency === "weekly"
                      ? "AeroCPI (Weekly Rollup)"
                      : "AeroCPI (Monthly Rollup)"
                    : "MoSPI Div 07.3",
                ]}
                labelFormatter={(label) =>
                  frequency === "monthly"
                    ? `Observation Month: ${label}`
                    : `Period: ${label}`
                }
              />
            <Legend
              wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: "11px", paddingTop: "10px" }}
              formatter={(val) =>
                val === "aerocpi"
                  ? frequency === "daily"
                    ? "AeroCPI (Daily GEKS-Törnqvist)"
                    : frequency === "weekly"
                    ? "AeroCPI (Weekly Geometric Rollup)"
                    : "AeroCPI (Monthly Geometric Rollup)"
                  : "MoSPI CPI Div 07.3"
              }
            />
            <Line
              type="monotone"
              dataKey="aerocpi"
              stroke="#C9A227"
              strokeWidth={2}
              dot={{ fill: "#C9A227", r: 3 }}
              activeDot={{ r: 5, fill: "#E8E4D4" }}
            />
            {frequency === "monthly" && hasMospiData && (
              <Line
                type="monotone"
                dataKey="mospi"
                stroke="#7FB86B"
                strokeWidth={2}
                strokeDasharray="4 4"
                connectNulls={true}
                dot={{ fill: "#7FB86B", r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>

      <div className="mt-3 pt-3 border-t border-line text-xs font-mono text-text-dim flex flex-wrap justify-between items-center gap-2">
        <span>METHOD: {methodLabel}</span>
        <div className="flex items-center gap-3">
          <span className="text-accent-amber flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
            POINTS: {chartData.length}
          </span>
          {frequency === "monthly" && !hasMospiData ? (
            <span className="text-accent-amber flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
              BENCHMARK: PENDING MOSPI OVERLAP
            </span>
          ) : (
            <span className="text-signal-green flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
              VERIFIED PROVENANCE
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
