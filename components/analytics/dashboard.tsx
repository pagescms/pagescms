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
import { SessionsChart } from "./sessions-chart";
import { Ga4TopTable } from "./ga4-top-table";
import { LeadsChart } from "./leads-chart";
import type {
  Ga4AiReferrals,
  Ga4Summary,
  Ga4TimeseriesPoint,
  Ga4TopRow,
  LeadsByFormRow,
  LeadsSummary,
  LeadsTimeseriesPoint,
  LlmCitedUrlRow,
  LlmMentionsSummary,
  LlmPromptRow,
  Summary,
  TimeseriesPoint,
  TopRow,
} from "@/lib/analytics/queries";
import type { ActivityRow } from "@/lib/analytics/types";
import { AI_SURFACES } from "@/lib/analytics/ai-sources";
import { ActivityFeed } from "./activity-feed";

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
  { label: "Activity", id: "activity" },
  { label: "Search", id: "search" },
  { label: "Traffic", id: "traffic" },
  { label: "Leads", id: "leads" },
  { label: "AI Citations", id: "ai-citations" },
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
  const { data: trafficData } = useSWR<{
    summary: Ga4Summary | null;
    points: Ga4TimeseriesPoint[];
    sources: Ga4TopRow[];
    landings: Ga4TopRow[];
    aiReferrals: Ga4AiReferrals | null;
  }>(tab === "traffic" ? `${base}/traffic?days=${days}` : null, fetcher);
  const { data: leadsData } = useSWR<{
    summary: LeadsSummary | null;
    points: LeadsTimeseriesPoint[];
    byForm: LeadsByFormRow[];
  }>(tab === "leads" ? `${base}/leads?days=${days}` : null, fetcher);
  const { data: llmData } = useSWR<{
    enabled: boolean;
    summary: LlmMentionsSummary | null;
    prompts: LlmPromptRow[];
    citedUrls: LlmCitedUrlRow[];
  }>(tab === "ai-citations" ? `${base}/llm-mentions?days=${days}` : null, fetcher);
  const { data: activityData } = useSWR<{ entries: ActivityRow[] }>(
    tab === "activity" ? `${base}/activity?days=${days}` : null,
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
            <KpiCard
              label="Clicks"
              value={formatNumber(s.current.clicks)}
              delta={s.delta.clicks}
              priorValue={formatNumber(s.previous.clicks)}
            />
            <KpiCard
              label="Impressions"
              value={formatNumber(s.current.impressions)}
              delta={s.delta.impressions}
              priorValue={formatNumber(s.previous.impressions)}
            />
            <KpiCard
              label="CTR"
              value={formatPct(s.current.ctr)}
              delta={s.delta.ctr}
              priorValue={formatPct(s.previous.ctr)}
            />
            <KpiCard
              label="Avg position"
              value={s.current.position != null ? s.current.position.toFixed(1) : "—"}
              delta={s.delta.position}
              priorValue={s.previous.position != null ? s.previous.position.toFixed(1) : null}
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

      {tab === "leads" && (
        <>
          {leadsData?.summary ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <KpiCard
                  label="Form submissions"
                  value={formatNumber(leadsData.summary.total)}
                  delta={leadsData.summary.delta}
                  priorValue={formatNumber(leadsData.summary.totalPrior)}
                />
                <KpiCard
                  label="Peak day"
                  value={
                    leadsData.summary.peakDay
                      ? `${leadsData.summary.peakDay.count}`
                      : "—"
                  }
                  delta={null}
                  sublabel={leadsData.summary.peakDay?.date}
                />
                <KpiCard
                  label="Avg / day"
                  value={leadsData.summary.avgPerDay.toFixed(1)}
                  delta={null}
                />
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 gap-3 flex-wrap">
                  <CardTitle>Form submissions by day</CardTitle>
                  <Pills
                    options={[
                      { label: "Daily", value: "day" },
                      { label: "Weekly", value: "week" },
                    ] as const}
                    value={granularity}
                    onChange={setGranularity}
                  />
                </CardHeader>
                <CardContent>
                  <LeadsChart points={leadsData.points} granularity={granularity} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Breakdown by form</CardTitle>
                </CardHeader>
                <CardContent>
                  {leadsData.byForm.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">
                      No form submissions in this window.
                    </div>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left">
                          <tr>
                            <th className="p-2 font-medium">Form</th>
                            <th className="p-2 font-medium text-right">Submissions</th>
                            <th className="p-2 font-medium text-right">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leadsData.byForm.map((row) => (
                            <tr key={row.form} className="border-t">
                              <td className="p-2">{row.form}</td>
                              <td className="p-2 text-right tabular-nums">
                                {formatNumber(row.submissions)}
                              </td>
                              <td className="p-2 text-right tabular-nums text-muted-foreground">
                                {leadsData.summary && leadsData.summary.total > 0
                                  ? `${((row.submissions / leadsData.summary.total) * 100).toFixed(0)}%`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground">
                Leads currently reflects Netlify Forms submissions only. CallRail &amp;
                WhatConverts call tracking will appear here once configured per-site.
              </p>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              {leadsData === undefined
                ? "Loading…"
                : "No leads data yet. Configure a Netlify site ID in Settings."}
            </div>
          )}
        </>
      )}

      {tab === "activity" && (
        <>
          {!activityData ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <ActivityFeed entries={activityData.entries} />
          )}
        </>
      )}

      {tab === "ai-citations" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>AI Citations</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Counts how often this site&apos;s domain is cited inside AI-generated answers from{" "}
                <strong>Google AI Overview (Gemini)</strong> and <strong>ChatGPT</strong>. Powered by
                DataForSEO&apos;s LLM Mentions index. <strong>Coverage limit:</strong> Perplexity, Claude,
                Gemini Direct, and Bing Copilot are not yet available in this dataset.
              </p>
            </CardHeader>
            <CardContent>
              {!llmData ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
                  Loading…
                </div>
              ) : !llmData.enabled ? (
                <div className="h-24 flex items-center justify-center text-center text-muted-foreground text-sm px-4">
                  AI Citations sync is disabled for this site. Enable it in{" "}
                  <a className="underline ml-1" href={`/${owner}/${repo}/analytics/settings`}>
                    Settings
                  </a>
                  .
                </div>
              ) : !llmData.summary || llmData.summary.latest.totalMentions === 0 ? (
                <div className="h-24 flex items-center justify-center text-center text-muted-foreground text-sm px-4">
                  No mentions detected yet. The DataForSEO index updates rolling-30-days; if this site is new,
                  expect mentions to appear within 4–8 weeks of publishing AI-friendly content.
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard
                    label="Total mentions"
                    value={formatNumber(llmData.summary.latest.totalMentions)}
                    delta={llmData.summary.priorLatest.totalMentions > 0 ? llmData.summary.delta.totalMentions : null}
                    priorValue={
                      llmData.summary.priorLatest.totalMentions > 0
                        ? formatNumber(llmData.summary.priorLatest.totalMentions)
                        : null
                    }
                  />
                  <KpiCard
                    label="Google AI Overview"
                    value={formatNumber(llmData.summary.latest.googleMentions)}
                    delta={null}
                  />
                  <KpiCard
                    label="ChatGPT"
                    value={formatNumber(llmData.summary.latest.chatGptMentions)}
                    delta={null}
                  />
                  <KpiCard
                    label="Unique prompts"
                    value={formatNumber(llmData.summary.latest.uniquePrompts)}
                    delta={null}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {llmData?.enabled && llmData.prompts.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top cited prompts</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Prompts where {owner}/{repo} appears as a source. Sorted by total mentions.
                  </p>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 font-medium">Prompt</th>
                        <th className="py-2 font-medium text-right">AIO</th>
                        <th className="py-2 font-medium text-right">ChatGPT</th>
                        <th className="py-2 font-medium text-right">AI vol.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {llmData.prompts.slice(0, 25).map((p) => (
                        <tr key={p.prompt} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-3">
                            <div className="font-medium leading-tight">{p.prompt}</div>
                            {p.answerSnippet && (
                              <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                {p.answerSnippet}
                              </div>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">{p.googleMentions || "—"}</td>
                          <td className="py-2 text-right tabular-nums">{p.chatGptMentions || "—"}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {p.aiSearchVolume ? formatNumber(p.aiSearchVolume) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top cited URLs</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pages on this site that AI surfaces cite most often.
                  </p>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 font-medium">URL</th>
                        <th className="py-2 font-medium text-right">AIO</th>
                        <th className="py-2 font-medium text-right">ChatGPT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {llmData.citedUrls.slice(0, 25).map((u) => (
                        <tr key={u.url} className="border-b last:border-0">
                          <td className="py-2 pr-3 break-all">
                            <a className="hover:underline" href={u.url} target="_blank" rel="noopener noreferrer">
                              {u.url}
                            </a>
                          </td>
                          <td className="py-2 text-right tabular-nums">{u.googleMentions || "—"}</td>
                          <td className="py-2 text-right tabular-nums">{u.chatGptMentions || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {tab === "traffic" && (
        <>
          {trafficData?.summary ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                  label="Sessions"
                  value={formatNumber(trafficData.summary.current.sessions)}
                  delta={trafficData.summary.delta.sessions}
                  priorValue={formatNumber(trafficData.summary.previous.sessions)}
                />
                <KpiCard
                  label="Users"
                  value={formatNumber(trafficData.summary.current.activeUsers)}
                  delta={trafficData.summary.delta.activeUsers}
                  priorValue={formatNumber(trafficData.summary.previous.activeUsers)}
                />
                <KpiCard
                  label="Engagement rate"
                  value={formatPct(trafficData.summary.current.engagementRate)}
                  delta={trafficData.summary.delta.engagementRate}
                  priorValue={formatPct(trafficData.summary.previous.engagementRate)}
                />
                <KpiCard
                  label="Pageviews"
                  value={formatNumber(trafficData.summary.current.screenPageViews)}
                  delta={trafficData.summary.delta.screenPageViews}
                  priorValue={formatNumber(trafficData.summary.previous.screenPageViews)}
                />
              </div>

              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 gap-3 flex-wrap">
                  <CardTitle>Sessions — GA4</CardTitle>
                  <Pills
                    options={[
                      { label: "Daily", value: "day" },
                      { label: "Weekly", value: "week" },
                    ] as const}
                    value={granularity}
                    onChange={setGranularity}
                  />
                </CardHeader>
                <CardContent>
                  <SessionsChart points={trafficData.points} granularity={granularity} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>AI Referrals</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Sessions referred from known AI surfaces (ChatGPT, Copilot, Perplexity, Claude, Gemini, +{AI_SURFACES.length - 5} more).
                      </p>
                    </div>
                    {trafficData.aiReferrals && trafficData.aiReferrals.totalSessions > 0 && (
                      <div className="text-right">
                        <div className="text-2xl font-semibold tabular-nums">
                          {trafficData.aiReferrals.totalSessions.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          sessions in window
                          {trafficData.aiReferrals.totalSessionsPrior > 0 && (
                            <span
                              className={cn(
                                "ml-2 font-medium",
                                trafficData.aiReferrals.delta >= 0 ? "text-green-600" : "text-red-600",
                              )}
                            >
                              {trafficData.aiReferrals.delta >= 0 ? "+" : ""}
                              {(trafficData.aiReferrals.delta * 100).toFixed(0)}% vs prior
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!trafficData.aiReferrals || trafficData.aiReferrals.totalSessions === 0 ? (
                    <div className="h-24 flex items-center justify-center text-center text-muted-foreground text-sm px-4">
                      No AI referral traffic detected in this window. Note: clicks from bing.com/chat appear as regular Bing traffic in GA4 and aren&apos;t countable here.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="py-2 font-medium">Surface</th>
                          <th className="py-2 font-medium text-right">Sessions</th>
                          <th className="py-2 font-medium text-right">Engaged</th>
                          <th className="py-2 font-medium text-right">Engagement rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trafficData.aiReferrals.perSurface.map((row) => {
                          const rate = row.sessions > 0 ? row.engagedSessions / row.sessions : 0;
                          return (
                            <tr key={row.sessionSourceMedium} className="border-b last:border-0">
                              <td className="py-2">
                                <div className="font-medium">{row.surface}</div>
                                <div className="text-xs text-muted-foreground">{row.sessionSourceMedium}</div>
                              </td>
                              <td className="py-2 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
                              <td className="py-2 text-right tabular-nums">{row.engagedSessions.toLocaleString()}</td>
                              <td className="py-2 text-right tabular-nums">{(rate * 100).toFixed(0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Top sources / mediums</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Ga4TopTable rows={trafficData.sources} valueLabel="Source / medium" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Top landing pages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Ga4TopTable rows={trafficData.landings} valueLabel="Landing page" valueIsPath />
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              {trafficData === undefined ? "Loading…" : "No GA4 data yet. Configure a property ID in Settings."}
            </div>
          )}
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
