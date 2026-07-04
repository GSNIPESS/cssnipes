"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TimeSeriesPoint = {
  label: string;
  value: number;
};

/**
 * Dark-themed line chart for rating/metric series (player form per map,
 * team rating over time). Server components pass plain {label, value} points.
 */
export function TimeSeriesChart({
  points,
  yDomain,
  referenceValue,
  height = 220,
}: {
  points: TimeSeriesPoint[];
  yDomain?: [number, number];
  referenceValue?: number;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#242c38" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#8b96a5", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#242c38" }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={yDomain ?? ["auto", "auto"]}
            tick={{ fill: "#8b96a5", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a212b",
              border: "1px solid #242c38",
              borderRadius: 6,
              color: "#e8edf2",
              fontSize: 12,
            }}
            labelStyle={{ color: "#8b96a5" }}
            formatter={(value) => [Number(value).toFixed(2), "value"]}
          />
          {referenceValue !== undefined && (
            <Line
              dataKey={() => referenceValue}
              stroke="#8b96a5"
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#f0a13a"
            strokeWidth={2}
            dot={{ r: 3, fill: "#f0a13a", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
