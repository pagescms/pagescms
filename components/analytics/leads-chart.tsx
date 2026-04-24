"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO, startOfWeek } from "date-fns";
import type { LeadsTimeseriesPoint } from "@/lib/analytics/queries";

type Props = {
  points: LeadsTimeseriesPoint[];
  granularity: "day" | "week";
};

const bucketKey = (date: string, granularity: "day" | "week") => {
  if (granularity === "day") return date;
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
};

export function LeadsChart({ points, granularity }: Props) {
  const data = (() => {
    const by = new Map<string, number>();
    for (const p of points) {
      const key = bucketKey(p.date, granularity);
      by.set(key, (by.get(key) ?? 0) + p.forms);
    }
    return Array.from(by.entries())
      .map(([bucket, forms]) => ({ bucket, forms }))
      .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
  })();

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="bucket"
            tickFormatter={(d: string) => format(parseISO(d), "MMM d")}
            fontSize={11}
            minTickGap={24}
          />
          <YAxis fontSize={11} width={28} allowDecimals={false} />
          <Tooltip
            labelFormatter={(label) =>
              typeof label === "string"
                ? format(parseISO(label), granularity === "week" ? "'Week of' MMM d" : "EEE, MMM d, yyyy")
                : String(label ?? "")
            }
            formatter={((value: unknown) => [String(value ?? 0), "Form submissions"]) as never}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Bar dataKey="forms" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
