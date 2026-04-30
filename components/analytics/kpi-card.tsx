"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  delta: number | null;
  /** When true, smaller delta is better (used for "avg position" where lower rank = better). */
  lowerIsBetter?: boolean;
  sublabel?: string;
  /** Pre-formatted prior-period value, shown as muted "was X" beside the delta. */
  priorValue?: string | null;
};

const formatDelta = (d: number) => {
  const sign = d > 0 ? "+" : "";
  return `${sign}${(d * 100).toFixed(1)}%`;
};

export function KpiCard({ label, value, delta, lowerIsBetter = false, sublabel, priorValue }: Props) {
  const better = delta == null ? null : lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta == null || delta === 0 ? Minus : better ? TrendingUp : TrendingDown;
  const tone =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : better
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <div className={cn("flex items-center gap-1 text-xs mt-1", tone)}>
          <Icon className="h-3 w-3" />
          <span>{delta == null ? "no prior period" : formatDelta(delta)}</span>
          {sublabel && <span className="text-muted-foreground ml-1">{sublabel}</span>}
        </div>
        {priorValue != null && priorValue !== "" && (
          <div className="text-xs text-muted-foreground mt-0.5">Prior period: {priorValue}</div>
        )}
      </CardContent>
    </Card>
  );
}
