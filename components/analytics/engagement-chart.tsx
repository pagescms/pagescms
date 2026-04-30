"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO, startOfWeek } from "date-fns";
import type { TimeseriesPoint } from "@/lib/analytics/queries";

type Props = {
  points: TimeseriesPoint[];
  granularity: "day" | "week";
};

type Row = {
  bucket: string;
  ctr: number;
  /** impression-weighted avg position across GSC only (Bing doesn't provide position) */
  position: number | null;
};

const bucketKey = (date: string, granularity: "day" | "week") => {
  if (granularity === "day") return date;
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
};

/**
 * Engagement chart derives CTR from summed GSC clicks/impressions per bucket.
 * Position comes directly from GSC (not stored separately in daily rollup, so
 * we approximate as NULL for now — will need a schema tweak to surface it).
 */
const aggregate = (points: TimeseriesPoint[], granularity: "day" | "week"): Row[] => {
  const by = new Map<string, { clicks: number; impressions: number; posSum: number; posWeight: number }>();
  for (const p of points) {
    const key = bucketKey(p.date, granularity);
    const existing = by.get(key) ?? { clicks: 0, impressions: 0, posSum: 0, posWeight: 0 };
    existing.clicks += p.gsc_clicks;
    existing.impressions += p.gsc_impressions;
    if (p.gsc_position != null && p.gsc_impressions > 0) {
      existing.posSum += p.gsc_position * p.gsc_impressions;
      existing.posWeight += p.gsc_impressions;
    }
    by.set(key, existing);
  }
  return Array.from(by.entries())
    .map(([bucket, v]) => ({
      bucket,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
      position: v.posWeight > 0 ? v.posSum / v.posWeight : null,
    }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
};

export function EngagementChart({ points, granularity }: Props) {
  const data = aggregate(points, granularity);
  const xFormat = "MMM d";

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="bucket"
            tickFormatter={(d: string) => format(parseISO(d), xFormat)}
            fontSize={11}
            minTickGap={24}
          />
          <YAxis
            yAxisId="ctr"
            fontSize={11}
            width={40}
            orientation="left"
            tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
          />
          <YAxis yAxisId="pos" fontSize={11} width={40} orientation="right" reversed domain={[1, "auto"]} />
          <Tooltip
            labelFormatter={(label) =>
              typeof label === "string"
                ? format(parseISO(label), granularity === "week" ? "'Week of' MMM d" : "EEE, MMM d, yyyy")
                : String(label ?? "")
            }
            formatter={((value: unknown, name: unknown) => {
              const v = value == null ? null : Number(value);
              const n = String(name ?? "");
              if (n === "CTR") return [v == null ? "—" : `${(v * 100).toFixed(2)}%`, n];
              if (n === "Avg position") return [v == null ? "—" : v.toFixed(1), n];
              return [v == null ? "—" : String(v), n];
            }) as never}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="ctr"
            type="monotone"
            name="CTR"
            dataKey="ctr"
            stroke="#1a73e8"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="pos"
            type="monotone"
            name="Avg position"
            dataKey="position"
            stroke="#ea580c"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
