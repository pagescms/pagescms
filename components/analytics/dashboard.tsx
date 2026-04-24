"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiCard } from "./kpi-card";
import { TimeseriesChart } from "./timeseries-chart";
import { TopTable } from "./top-table";
import type { Summary, TimeseriesPoint, TopRow } from "@/lib/analytics/queries";

type Props = {
  owner: string;
  repo: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const DAY_PRESETS = [
  { label: "7d", days: 7 },
  { label: "28d", days: 28 },
  { label: "90d", days: 90 },
] as const;

const TABS = [
  { label: "Overview", id: "overview" },
  { label: "Search", id: "search" },
] as const;

const formatNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);
const formatPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function AnalyticsDashboard({ owner, repo }: Props) {
  const [days, setDays] = useState(28);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [chartMetric, setChartMetric] = useState<"clicks" | "impressions">("clicks");

  const base = `/api/${owner}/${repo}/analytics`;
  const { data: summaryData } = useSWR<{ summary: Summary | null }>(`${base}/summary?days=${days}`, fetcher);
  const { data: tsData } = useSWR<{ points: TimeseriesPoint[] }>(
    tab === "overview" ? `${base}/timeseries?days=${days}` : null,
    fetcher,
  );
  const { data: queriesData } = useSWR<{ rows: TopRow[] }>(
    tab === "search" ? `${base}/top-queries?days=${days}&provider=gsc&limit=50` : null,
    fetcher,
  );
  const { data: pagesData } = useSWR<{ rows: TopRow[] }>(
    tab === "search" ? `${base}/top-pages?days=${days}&provider=gsc&limit=50` : null,
    fetcher,
  );

  const s = summaryData?.summary;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          {s && (
            <p className="text-xs text-muted-foreground mt-1">
              {s.window.start} → {s.window.end} · vs {s.prior.start} → {s.prior.end}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md border p-0.5">
            {DAY_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={cn(
                  "px-3 py-1 text-xs rounded",
                  days === p.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/${owner}/${repo}/analytics/settings`}>
            Settings
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-1 pb-2 text-sm border-b-2 -mb-px",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!summaryData && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {s && tab === "overview" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Clicks" value={formatNumber(s.current.clicks)} delta={s.delta.clicks} />
            <KpiCard label="Impressions" value={formatNumber(s.current.impressions)} delta={s.delta.impressions} />
            <KpiCard label="CTR" value={formatPct(s.current.ctr)} delta={s.delta.ctr} />
            <KpiCard
              label="Avg position"
              value={s.current.position != null ? s.current.position.toFixed(1) : "—"}
              delta={s.delta.position}
              lowerIsBetter
            />
          </div>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle>Traffic — {chartMetric === "clicks" ? "Clicks" : "Impressions"} by day</CardTitle>
              <div className="inline-flex rounded-md border p-0.5">
                {(["clicks", "impressions"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChartMetric(m)}
                    className={cn(
                      "px-3 py-1 text-xs rounded capitalize",
                      chartMetric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {tsData ? (
                <TimeseriesChart points={tsData.points} metric={chartMetric} />
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "search" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top queries (GSC)</CardTitle>
            </CardHeader>
            <CardContent>
              {queriesData ? (
                <TopTable rows={queriesData.rows} valueLabel="Query" />
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading queries…</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top pages (GSC)</CardTitle>
            </CardHeader>
            <CardContent>
              {pagesData ? (
                <TopTable rows={pagesData.rows} valueLabel="Page" valueIsUrl />
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading pages…</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
