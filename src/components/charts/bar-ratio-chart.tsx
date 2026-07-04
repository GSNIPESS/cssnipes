"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type BarRatioPoint = {
  label: string;
  /** 0..1 ratio, e.g. map win rate. */
  ratio: number;
};

/** Dark-themed bar chart for 0–100% ratios (e.g. per-map win rates). */
export function BarRatioChart({
  points,
  height = 220,
}: {
  points: BarRatioPoint[];
  height?: number;
}) {
  const data = points.map((p) => ({ ...p, percent: p.ratio * 100 }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#242c38" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#8b96a5", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#242c38" }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#8b96a5", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: "#1a212b" }}
            contentStyle={{
              backgroundColor: "#1a212b",
              border: "1px solid #242c38",
              borderRadius: 6,
              color: "#e8edf2",
              fontSize: 12,
            }}
            labelStyle={{ color: "#8b96a5" }}
            formatter={(value) => [`${Number(value).toFixed(0)}%`, "win rate"]}
          />
          <Bar dataKey="percent" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((p) => (
              <Cell key={p.label} fill={p.ratio >= 0.5 ? "#4ade80" : "#f87171"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
