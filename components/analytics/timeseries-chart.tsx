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
  mode: "normalized" | "raw";
};

type Row = {
  bucket: string;
  gsc_clicks: number;
  gsc_impressions: number;
  bing_clicks: number;
  bing_impressions: number;
};

const bucketKey = (date: string, granularity: "day" | "week") => {
  if (granularity === "day") return date;
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
};

const aggregate = (points: TimeseriesPoint[], granularity: "day" | "week"): Row[] => {
  const by = new Map<string, Row>();
  for (const p of points) {
    const key = bucketKey(p.date, granularity);
    const existing = by.get(key) ?? {
      bucket: key,
      gsc_clicks: 0,
      gsc_impressions: 0,
      bing_clicks: 0,
      bing_impressions: 0,
    };
    existing.gsc_clicks += p.gsc_clicks;
    existing.gsc_impressions += p.gsc_impressions;
    existing.bing_clicks += p.bing_clicks;
    existing.bing_impressions += p.bing_impressions;
    by.set(key, existing);
  }
  return Array.from(by.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
};

const SERIES = [
  { key: "gsc_clicks", label: "GSC clicks", color: "#1a73e8", dash: "0" },
  { key: "bing_clicks", label: "Bing clicks", color: "#00809d", dash: "0" },
  { key: "gsc_impressions", label: "GSC impressions", color: "#1a73e8", dash: "5 3" },
  { key: "bing_impressions", label: "Bing impressions", color: "#00809d", dash: "5 3" },
] as const;

export function TimeseriesChart({ points, granularity, mode }: Props) {
  const raw = aggregate(points, granularity);

  // Per-series maxes for normalization
  const maxes: Record<string, number> = {};
  for (const s of SERIES) {
    maxes[s.key] = Math.max(0, ...raw.map((r) => (r as unknown as Record<string, number>)[s.key] ?? 0));
  }

  const chartData = raw.map((r) => {
    if (mode === "raw") return r;
    const row: Record<string, number | string> = { bucket: r.bucket };
    for (const s of SERIES) {
      const m = maxes[s.key];
      const v = (r as unknown as Record<string, number>)[s.key] ?? 0;
      row[s.key] = m > 0 ? (v / m) * 100 : 0;
      row[`${s.key}_raw`] = v;
    }
    return row;
  });

  const xFormat = granularity === "day" ? "MMM d" : "MMM d";

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: mode === "raw" ? 48 : 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="bucket"
            tickFormatter={(d: string) => format(parseISO(d), xFormat)}
            fontSize={11}
            minTickGap={24}
          />
          {mode === "normalized" ? (
            <YAxis
              fontSize={11}
              width={40}
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
          ) : (
            <>
              <YAxis yAxisId="clicks" fontSize={11} width={40} orientation="left" />
              <YAxis yAxisId="impr" fontSize={11} width={48} orientation="right" />
            </>
          )}
          <Tooltip
            labelFormatter={(label) =>
              typeof label === "string"
                ? format(parseISO(label), granularity === "week" ? "'Week of' MMM d" : "EEE, MMM d, yyyy")
                : String(label ?? "")
            }
            formatter={((value: unknown, name: unknown, item: unknown) => {
              const v = Number(value ?? 0);
              const n = String(name ?? "");
              if (mode === "normalized") {
                const rawKey = SERIES.find((s) => s.label === n)?.key;
                const payload = (item as { payload?: Record<string, number> })?.payload;
                const rawVal = rawKey && payload ? payload[`${rawKey}_raw`] : undefined;
                return [`${v.toFixed(0)}% (${rawVal ?? "—"})`, n];
              }
              return [v.toLocaleString(), n];
            }) as never}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {SERIES.map((s) => {
            const isClicks = s.key.endsWith("_clicks");
            return (
              <Line
                key={s.key}
                type="monotone"
                name={s.label}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dash}
                dot={false}
                yAxisId={mode === "raw" ? (isClicks ? "clicks" : "impr") : undefined}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
