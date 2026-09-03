"use client";

import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface ElasticityPoint {
  window: string;
  daysToDeparture: number;
  averageFare: number;
  elasticityIndex: number;
}

const ELASTICITY_DATA: ElasticityPoint[] = [
  { window: "T+30", daysToDeparture: 30, averageFare: 4120, elasticityIndex: 100.0 },
  { window: "T+21", daysToDeparture: 21, averageFare: 4450, elasticityIndex: 108.0 },
  { window: "T+15", daysToDeparture: 15, averageFare: 5080, elasticityIndex: 123.3 },
  { window: "T+10", daysToDeparture: 10, averageFare: 5420, elasticityIndex: 131.5 },
  { window: "T+7", daysToDeparture: 7, averageFare: 6150, elasticityIndex: 149.2 },
];

export const ElasticityCurve: React.FC = () => {
  return (
    <div className="bg-panel border border-line p-5 rounded-sm">
      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <div>
          <span className="font-mono text-xs text-accent-amber block">[ ELASTICITY :: LEAD-TIME DYNAMICS ]</span>
          <h2 className="text-base font-semibold text-text-primary">
            Booking Window Elasticity Curve
          </h2>
        </div>
        <span className="font-mono text-xs text-signal-green">+49.2% T+30 → T+7</span>
      </div>

      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={ELASTICITY_DATA} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="elasticityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C9A227" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#C9A227" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#262316" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="window"
              stroke="#8A8672"
              fontSize={11}
              fontFamily="JetBrains Mono"
              tickLine={false}
            />
            <YAxis
              stroke="#8A8672"
              fontSize={11}
              fontFamily="JetBrains Mono"
              domain={[3500, 6800]}
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
              formatter={(value: any, name: string) => [
                `₹${Number(value).toLocaleString()}`,
                "Mean Basket Fare",
              ]}
              labelFormatter={(label) => `Advance Window: ${label}`}
            />
            <Area
              type="monotone"
              dataKey="averageFare"
              stroke="#C9A227"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#elasticityGradient)"
              dot={{ fill: "#C9A227", r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 pt-3 border-t border-line text-xs font-mono text-text-dim flex justify-between">
        <span>DYNAMIC SURGE: Steepest slope between T+15 and T+7 (+21.0%)</span>
        <span className="text-text-primary">BASE: T+30 = 100.0</span>
      </div>
    </div>
  );
};
