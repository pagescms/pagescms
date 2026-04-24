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
import type { Ga4TimeseriesPoint } from "@/lib/analytics/queries";

type Props = {
  points: Ga4TimeseriesPoint[];
  granularity: "day" | "week";
};

const bucketKey = (date: string, granularity: "day" | "week") => {
  if (granularity === "day") return date;
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
};

type Row = {
  bucket: string;
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
};

const aggregate = (points: Ga4TimeseriesPoint[], granularity: "day" | "week"): Row[] => {
  const by = new Map<string, Row>();
  for (const p of points) {
    const key = bucketKey(p.date, granularity);
    const existing = by.get(key) ?? { bucket: key, sessions: 0, activeUsers: 0, engagedSessions: 0 };
    existing.sessions += p.sessions;
    existing.activeUsers += p.activeUsers;
    existing.engagedSessions += p.engagedSessions;
    by.set(key, existing);
  }
  return Array.from(by.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
};

export function SessionsChart({ points, granularity }: Props) {
  const data = aggregate(points, granularity);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="bucket"
            tickFormatter={(d: string) => format(parseISO(d), "MMM d")}
            fontSize={11}
            minTickGap={24}
          />
          <YAxis fontSize={11} width={40} />
          <Tooltip
            labelFormatter={(label) =>
              typeof label === "string"
                ? format(parseISO(label), granularity === "week" ? "'Week of' MMM d" : "EEE, MMM d, yyyy")
                : String(label ?? "")
            }
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" name="Sessions" dataKey="sessions" stroke="#16a34a" strokeWidth={2} dot={false} />
          <Line type="monotone" name="Users" dataKey="activeUsers" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line
            type="monotone"
            name="Engaged"
            dataKey="engagedSessions"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
