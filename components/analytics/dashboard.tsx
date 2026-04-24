"use client";

import { useState } from "react";
import useSWR from "swr";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiCard } from "./kpi-card";
import { TimeseriesChart } from "./timeseries-chart";
import { EngagementChart } from "./engagement-chart";
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

type PillOption<T extends string> = { label: string; value: T };

function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1 text-xs rounded",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsDashboard({ owner, repo }: Props) {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [mode, setMode] = useState<"normalized" | "raw">("normalized");

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
          <Pills
            options={DAY_PRESETS.map((p) => ({ label: p.label, value: String(p.days) })) as readonly PillOption<string>[]}
            value={String(days)}
            onChange={(v) => setDays(parseInt(v, 10) as 7 | 28 | 90)}
          />
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
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 gap-3 flex-wrap">
              <CardTitle>Traffic</CardTitle>
              <div className="flex items-center gap-2">
                <Pills
                  options={[
                    { label: "Daily", value: "day" },
                    { label: "Weekly", value: "week" },
                  ] as const}
                  value={granularity}
                  onChange={setGranularity}
                />
                <Pills
                  options={[
                    { label: "Normalized", value: "normalized" },
                    { label: "Raw", value: "raw" },
                  ] as const}
                  value={mode}
                  onChange={setMode}
                />
              </div>
            </CardHeader>
            <CardContent>
              {tsData ? (
                <TimeseriesChart points={tsData.points} granularity={granularity} mode={mode} />
              ) : (
                <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
              )}
              {mode === "normalized" && (
                <p className="text-xs text-muted-foreground mt-2">
                  Each line is scaled 0–100% of its own peak in this window. Hover a point to see raw values.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Engagement — CTR &amp; avg position (GSC)</CardTitle>
            </CardHeader>
            <CardContent>
              {tsData ? (
                <EngagementChart points={tsData.points} granularity={granularity} />
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Position axis is inverted — higher on the chart = better ranking. Bing doesn&apos;t expose per-day
                position so this chart is GSC-only.
              </p>
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
