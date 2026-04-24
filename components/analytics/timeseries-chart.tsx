"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import type { TimeseriesPoint } from "@/lib/analytics/queries";

type Props = {
  points: TimeseriesPoint[];
  metric: "clicks" | "impressions";
};

export function TimeseriesChart({ points, metric }: Props) {
  const data = points.map((p) => ({
    date: p.date,
    GSC: metric === "clicks" ? p.gsc_clicks : p.gsc_impressions,
    Bing: metric === "clicks" ? p.bing_clicks : p.bing_impressions,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gscFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4285F4" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#4285F4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="bingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00809d" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#00809d" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => format(parseISO(d), "MMM d")}
            fontSize={11}
            minTickGap={24}
          />
          <YAxis fontSize={11} width={36} />
          <Tooltip
            labelFormatter={(label) =>
              typeof label === "string" ? format(parseISO(label), "EEE, MMM d, yyyy") : String(label ?? "")
            }
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="GSC" stroke="#4285F4" strokeWidth={2} fill="url(#gscFill)" stackId={metric === "clicks" ? "1" : undefined} />
          <Area type="monotone" dataKey="Bing" stroke="#00809d" strokeWidth={2} fill="url(#bingFill)" stackId={metric === "clicks" ? "1" : undefined} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
