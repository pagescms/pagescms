import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsDailyTable, analyticsDimensionTable } from "@/db/schema";
import type { AnalyticsProvider } from "./types";
import { matchAiSurface } from "./ai-sources";

/** YYYY-MM-DD helpers — we store date as TEXT so string compare is correct. */
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

/**
 * Analytics data lags ~3 days (GSC). "Today" for the window is today - 3 days.
 */
const getWindow = (days: number) => {
  const end = addDays(new Date(), -3);
  const start = addDays(end, -(days - 1));
  const priorEnd = addDays(start, -1);
  const priorStart = addDays(priorEnd, -(days - 1));
  return { start: fmt(start), end: fmt(end), priorStart: fmt(priorStart), priorEnd: fmt(priorEnd) };
};

type ProviderFilter = AnalyticsProvider | "combined";

export type SummaryMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

export type Summary = {
  window: { start: string; end: string };
  prior: { start: string; end: string };
  current: SummaryMetrics;
  previous: SummaryMetrics;
  delta: { clicks: number; impressions: number; ctr: number; position: number | null };
};

const aggregateSum = async (siteId: number, provider: ProviderFilter, start: string, end: string): Promise<SummaryMetrics> => {
  const providerFilter =
    provider === "combined"
      ? sql`${analyticsDailyTable.provider} IN ('gsc','bing')`
      : eq(analyticsDailyTable.provider, provider);

  const rows = await db
    .select({
      clicks: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'clicks')::int), 0)`,
      impressions: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'impressions')::int), 0)`,
      position_sum: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'position')::numeric * (${analyticsDailyTable.metrics}->>'impressions')::int), 0)`,
      position_weight: sql<number>`coalesce(sum(
        case when (${analyticsDailyTable.metrics}->>'position') is not null
        then (${analyticsDailyTable.metrics}->>'impressions')::int else 0 end
      ), 0)`,
    })
    .from(analyticsDailyTable)
    .where(
      and(
        eq(analyticsDailyTable.siteId, siteId),
        providerFilter,
        gte(analyticsDailyTable.date, start),
        lte(analyticsDailyTable.date, end),
      ),
    );

  const r = rows[0] ?? { clicks: 0, impressions: 0, position_sum: 0, position_weight: 0 };
  const clicks = Number(r.clicks ?? 0);
  const impressions = Number(r.impressions ?? 0);
  const positionWeight = Number(r.position_weight ?? 0);
  const positionSum = Number(r.position_sum ?? 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: positionWeight > 0 ? positionSum / positionWeight : null,
  };
};

const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 1 : 0) : (a - b) / b);

export const getSummary = async (
  siteId: number,
  days: number,
  provider: ProviderFilter = "combined",
): Promise<Summary> => {
  const w = getWindow(days);
  const current = await aggregateSum(siteId, provider, w.start, w.end);
  const previous = await aggregateSum(siteId, provider, w.priorStart, w.priorEnd);

  return {
    window: { start: w.start, end: w.end },
    prior: { start: w.priorStart, end: w.priorEnd },
    current,
    previous,
    delta: {
      clicks: pct(current.clicks, previous.clicks),
      impressions: pct(current.impressions, previous.impressions),
      ctr: pct(current.ctr, previous.ctr),
      position:
        current.position != null && previous.position != null
          ? pct(previous.position, current.position) // position improves when it goes DOWN, so invert
          : null,
    },
  };
};

export type TimeseriesPoint = {
  date: string;
  gsc_clicks: number;
  gsc_impressions: number;
  gsc_position: number | null;
  bing_clicks: number;
  bing_impressions: number;
};

const emptyPoint = (date: string): TimeseriesPoint => ({
  date,
  gsc_clicks: 0,
  gsc_impressions: 0,
  gsc_position: null,
  bing_clicks: 0,
  bing_impressions: 0,
});

export const getTimeseries = async (siteId: number, days: number): Promise<TimeseriesPoint[]> => {
  const w = getWindow(days);

  const rows = await db
    .select({
      date: analyticsDailyTable.date,
      provider: analyticsDailyTable.provider,
      clicks: sql<number>`(${analyticsDailyTable.metrics}->>'clicks')::int`,
      impressions: sql<number>`(${analyticsDailyTable.metrics}->>'impressions')::int`,
      position: sql<number | null>`(${analyticsDailyTable.metrics}->>'position')::numeric`,
    })
    .from(analyticsDailyTable)
    .where(
      and(
        eq(analyticsDailyTable.siteId, siteId),
        sql`${analyticsDailyTable.provider} IN ('gsc','bing')`,
        gte(analyticsDailyTable.date, w.start),
        lte(analyticsDailyTable.date, w.end),
      ),
    )
    .orderBy(analyticsDailyTable.date);

  // Pivot provider → columns, zero-fill missing dates.
  const byDate = new Map<string, TimeseriesPoint>();
  for (const r of rows) {
    const existing = byDate.get(r.date) ?? emptyPoint(r.date);
    if (r.provider === "gsc") {
      existing.gsc_clicks += Number(r.clicks ?? 0);
      existing.gsc_impressions += Number(r.impressions ?? 0);
      if (r.position != null) existing.gsc_position = Number(r.position);
    } else if (r.provider === "bing") {
      existing.bing_clicks += Number(r.clicks ?? 0);
      existing.bing_impressions += Number(r.impressions ?? 0);
    }
    byDate.set(r.date, existing);
  }

  // Fill missing dates with zeros so the line chart doesn't gap
  const out: TimeseriesPoint[] = [];
  for (let d = new Date(w.start); fmt(d) <= w.end; d = addDays(d, 1)) {
    const key = fmt(d);
    out.push(byDate.get(key) ?? emptyPoint(key));
  }
  return out;
};

export type TopRow = {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

const getTop = async (
  siteId: number,
  dimension: "query" | "page",
  days: number,
  provider: ProviderFilter,
  limit = 50,
): Promise<TopRow[]> => {
  const w = getWindow(days);
  const providerFilter =
    provider === "combined"
      ? sql`${analyticsDimensionTable.provider} IN ('gsc','bing')`
      : eq(analyticsDimensionTable.provider, provider);

  // Aggregate across dates within the window; dimensions are snapshot-per-date, so we sum.
  const rows = await db
    .select({
      value: analyticsDimensionTable.value,
      clicks: sql<number>`coalesce(sum((${analyticsDimensionTable.metrics}->>'clicks')::int), 0)`,
      impressions: sql<number>`coalesce(sum((${analyticsDimensionTable.metrics}->>'impressions')::int), 0)`,
      position_sum: sql<number>`coalesce(sum((${analyticsDimensionTable.metrics}->>'position')::numeric * (${analyticsDimensionTable.metrics}->>'impressions')::int), 0)`,
      position_weight: sql<number>`coalesce(sum(
        case when (${analyticsDimensionTable.metrics}->>'position') is not null
        then (${analyticsDimensionTable.metrics}->>'impressions')::int else 0 end
      ), 0)`,
    })
    .from(analyticsDimensionTable)
    .where(
      and(
        eq(analyticsDimensionTable.siteId, siteId),
        eq(analyticsDimensionTable.dimension, dimension),
        providerFilter,
        gte(analyticsDimensionTable.date, w.start),
        lte(analyticsDimensionTable.date, w.end),
      ),
    )
    .groupBy(analyticsDimensionTable.value)
    .orderBy(desc(sql`coalesce(sum((${analyticsDimensionTable.metrics}->>'clicks')::int), 0)`))
    .limit(limit);

  return rows.map((r) => {
    const clicks = Number(r.clicks ?? 0);
    const impressions = Number(r.impressions ?? 0);
    const posWeight = Number(r.position_weight ?? 0);
    const posSum = Number(r.position_sum ?? 0);
    return {
      value: r.value,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: posWeight > 0 ? posSum / posWeight : null,
    };
  });
};

export const getTopQueries = (siteId: number, days: number, provider: ProviderFilter = "gsc", limit = 50) =>
  getTop(siteId, "query", days, provider, limit);

export const getTopPages = (siteId: number, days: number, provider: ProviderFilter = "gsc", limit = 50) =>
  getTop(siteId, "page", days, provider, limit);

/* ─── GA4 reads ─────────────────────────────────────────────────────────── */

export type Ga4SummaryMetrics = {
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
  screenPageViews: number;
  engagementRate: number;
};

export type Ga4Summary = {
  window: { start: string; end: string };
  prior: { start: string; end: string };
  current: Ga4SummaryMetrics;
  previous: Ga4SummaryMetrics;
  delta: { sessions: number; activeUsers: number; engagedSessions: number; screenPageViews: number; engagementRate: number };
};

const ga4Aggregate = async (siteId: number, start: string, end: string): Promise<Ga4SummaryMetrics> => {
  const rows = await db
    .select({
      sessions: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'sessions')::int), 0)`,
      activeUsers: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'activeUsers')::int), 0)`,
      engagedSessions: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'engagedSessions')::int), 0)`,
      screenPageViews: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'screenPageViews')::int), 0)`,
    })
    .from(analyticsDailyTable)
    .where(
      and(
        eq(analyticsDailyTable.siteId, siteId),
        eq(analyticsDailyTable.provider, "ga4"),
        gte(analyticsDailyTable.date, start),
        lte(analyticsDailyTable.date, end),
      ),
    );
  const r = rows[0] ?? { sessions: 0, activeUsers: 0, engagedSessions: 0, screenPageViews: 0 };
  const sessions = Number(r.sessions ?? 0);
  const engaged = Number(r.engagedSessions ?? 0);
  return {
    sessions,
    activeUsers: Number(r.activeUsers ?? 0),
    engagedSessions: engaged,
    screenPageViews: Number(r.screenPageViews ?? 0),
    engagementRate: sessions > 0 ? engaged / sessions : 0,
  };
};

export const getGa4Summary = async (siteId: number, days: number): Promise<Ga4Summary> => {
  const w = getWindow(days);
  const current = await ga4Aggregate(siteId, w.start, w.end);
  const previous = await ga4Aggregate(siteId, w.priorStart, w.priorEnd);
  return {
    window: { start: w.start, end: w.end },
    prior: { start: w.priorStart, end: w.priorEnd },
    current,
    previous,
    delta: {
      sessions: pct(current.sessions, previous.sessions),
      activeUsers: pct(current.activeUsers, previous.activeUsers),
      engagedSessions: pct(current.engagedSessions, previous.engagedSessions),
      screenPageViews: pct(current.screenPageViews, previous.screenPageViews),
      engagementRate: pct(current.engagementRate, previous.engagementRate),
    },
  };
};

export type Ga4TimeseriesPoint = {
  date: string;
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
  screenPageViews: number;
};

const emptyGa4 = (date: string): Ga4TimeseriesPoint => ({
  date,
  sessions: 0,
  activeUsers: 0,
  engagedSessions: 0,
  screenPageViews: 0,
});

export const getGa4Timeseries = async (siteId: number, days: number): Promise<Ga4TimeseriesPoint[]> => {
  const w = getWindow(days);
  const rows = await db
    .select({
      date: analyticsDailyTable.date,
      sessions: sql<number>`(${analyticsDailyTable.metrics}->>'sessions')::int`,
      activeUsers: sql<number>`(${analyticsDailyTable.metrics}->>'activeUsers')::int`,
      engagedSessions: sql<number>`(${analyticsDailyTable.metrics}->>'engagedSessions')::int`,
      screenPageViews: sql<number>`(${analyticsDailyTable.metrics}->>'screenPageViews')::int`,
    })
    .from(analyticsDailyTable)
    .where(
      and(
        eq(analyticsDailyTable.siteId, siteId),
        eq(analyticsDailyTable.provider, "ga4"),
        gte(analyticsDailyTable.date, w.start),
        lte(analyticsDailyTable.date, w.end),
      ),
    )
    .orderBy(analyticsDailyTable.date);

  const byDate = new Map<string, Ga4TimeseriesPoint>();
  for (const r of rows) {
    byDate.set(r.date, {
      date: r.date,
      sessions: Number(r.sessions ?? 0),
      activeUsers: Number(r.activeUsers ?? 0),
      engagedSessions: Number(r.engagedSessions ?? 0),
      screenPageViews: Number(r.screenPageViews ?? 0),
    });
  }
  const out: Ga4TimeseriesPoint[] = [];
  for (let d = new Date(w.start); fmt(d) <= w.end; d = addDays(d, 1)) {
    const key = fmt(d);
    out.push(byDate.get(key) ?? emptyGa4(key));
  }
  return out;
};

export type Ga4TopRow = {
  value: string;
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
  engagementRate: number;
};

const getGa4Top = async (
  siteId: number,
  dimension: "source" | "landing_page",
  days: number,
  limit: number,
): Promise<Ga4TopRow[]> => {
  const w = getWindow(days);
  const rows = await db
    .select({
      value: analyticsDimensionTable.value,
      sessions: sql<number>`coalesce(sum((${analyticsDimensionTable.metrics}->>'sessions')::int), 0)`,
      activeUsers: sql<number>`coalesce(sum((${analyticsDimensionTable.metrics}->>'activeUsers')::int), 0)`,
      engagedSessions: sql<number>`coalesce(sum((${analyticsDimensionTable.metrics}->>'engagedSessions')::int), 0)`,
    })
    .from(analyticsDimensionTable)
    .where(
      and(
        eq(analyticsDimensionTable.siteId, siteId),
        eq(analyticsDimensionTable.provider, "ga4"),
        eq(analyticsDimensionTable.dimension, dimension),
        gte(analyticsDimensionTable.date, w.start),
        lte(analyticsDimensionTable.date, w.end),
      ),
    )
    .groupBy(analyticsDimensionTable.value)
    .orderBy(desc(sql`coalesce(sum((${analyticsDimensionTable.metrics}->>'sessions')::int), 0)`))
    .limit(limit);
  return rows.map((r) => {
    const sessions = Number(r.sessions ?? 0);
    const engaged = Number(r.engagedSessions ?? 0);
    return {
      value: r.value,
      sessions,
      activeUsers: Number(r.activeUsers ?? 0),
      engagedSessions: engaged,
      engagementRate: sessions > 0 ? engaged / sessions : 0,
    };
  });
};

export const getGa4TopSources = (siteId: number, days: number, limit = 50) =>
  getGa4Top(siteId, "source", days, limit);

export const getGa4TopLandings = (siteId: number, days: number, limit = 50) =>
  getGa4Top(siteId, "landing_page", days, limit);

/* ─── AI Referrals (filter GA4 source rows by known AI hostnames) ─────── */
//
// Bing has no public API for Copilot citations as of early 2026, and clicks
// from bing.com/chat are indistinguishable from regular Bing organic at the
// GA4 sessionSourceMedium level. The closest signal we can give clients is
// "sessions referred from a known AI surface" (ChatGPT / Perplexity / Claude
// / Gemini / Copilot direct app / etc.). See lib/analytics/ai-sources.ts.

export type AiReferralRow = {
  surface: string;
  sessionSourceMedium: string;
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
};

export type Ga4AiReferrals = {
  window: { start: string; end: string };
  prior: { start: string; end: string };
  totalSessions: number;
  totalSessionsPrior: number;
  delta: number;
  perSurface: AiReferralRow[];
  timeseries: { date: string; sessions: number }[];
};

export const getGa4AiReferrals = async (siteId: number, days: number): Promise<Ga4AiReferrals> => {
  const w = getWindow(days);
  const rows = await db
    .select({
      date: analyticsDimensionTable.date,
      value: analyticsDimensionTable.value,
      sessions: sql<number>`coalesce((${analyticsDimensionTable.metrics}->>'sessions')::int, 0)`,
      activeUsers: sql<number>`coalesce((${analyticsDimensionTable.metrics}->>'activeUsers')::int, 0)`,
      engagedSessions: sql<number>`coalesce((${analyticsDimensionTable.metrics}->>'engagedSessions')::int, 0)`,
    })
    .from(analyticsDimensionTable)
    .where(
      and(
        eq(analyticsDimensionTable.siteId, siteId),
        eq(analyticsDimensionTable.provider, "ga4"),
        eq(analyticsDimensionTable.dimension, "source"),
        gte(analyticsDimensionTable.date, w.priorStart),
        lte(analyticsDimensionTable.date, w.end),
      ),
    );

  const perSurfaceMap = new Map<string, AiReferralRow>();
  const timeseriesMap = new Map<string, number>();
  let totalSessions = 0;
  let totalSessionsPrior = 0;

  for (const r of rows) {
    const surface = matchAiSurface(r.value);
    if (!surface) continue;
    const sessions = Number(r.sessions ?? 0);
    const inCurrent = r.date >= w.start && r.date <= w.end;
    const inPrior = r.date >= w.priorStart && r.date <= w.priorEnd;
    if (inPrior) totalSessionsPrior += sessions;
    if (!inCurrent) continue;

    totalSessions += sessions;
    timeseriesMap.set(r.date, (timeseriesMap.get(r.date) ?? 0) + sessions);

    const existing = perSurfaceMap.get(r.value) ?? {
      surface: surface.label,
      sessionSourceMedium: r.value,
      sessions: 0,
      activeUsers: 0,
      engagedSessions: 0,
    };
    existing.sessions += sessions;
    existing.activeUsers += Number(r.activeUsers ?? 0);
    existing.engagedSessions += Number(r.engagedSessions ?? 0);
    perSurfaceMap.set(r.value, existing);
  }

  const timeseries: { date: string; sessions: number }[] = [];
  for (let d = new Date(w.start); fmt(d) <= w.end; d = addDays(d, 1)) {
    const key = fmt(d);
    timeseries.push({ date: key, sessions: timeseriesMap.get(key) ?? 0 });
  }

  const perSurface = [...perSurfaceMap.values()].sort((a, b) => b.sessions - a.sessions);

  return {
    window: { start: w.start, end: w.end },
    prior: { start: w.priorStart, end: w.priorEnd },
    totalSessions,
    totalSessionsPrior,
    delta: pct(totalSessions, totalSessionsPrior),
    perSurface,
    timeseries,
  };
};

/* ─── Leads (Netlify Forms + future CallRail/WhatConverts) ────────────── */

export type LeadsSummary = {
  window: { start: string; end: string };
  prior: { start: string; end: string };
  total: number;
  totalPrior: number;
  delta: number;
  peakDay: { date: string; count: number } | null;
  avgPerDay: number;
};

export type LeadsTimeseriesPoint = { date: string; forms: number };
export type LeadsByFormRow = { form: string; submissions: number };

type LeadsProvider = "netlify_forms"; // Expand when callrail/whatconverts join.

const sumLeadsInWindow = async (siteId: number, start: string, end: string): Promise<number> => {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'submissions')::int), 0)`,
    })
    .from(analyticsDailyTable)
    .where(
      and(
        eq(analyticsDailyTable.siteId, siteId),
        eq(analyticsDailyTable.provider, "netlify_forms" satisfies LeadsProvider),
        gte(analyticsDailyTable.date, start),
        lte(analyticsDailyTable.date, end),
      ),
    );
  return Number(rows[0]?.total ?? 0);
};

export const getLeadsSummary = async (siteId: number, days: number): Promise<LeadsSummary> => {
  const w = getWindow(days);
  const [total, totalPrior, peak] = await Promise.all([
    sumLeadsInWindow(siteId, w.start, w.end),
    sumLeadsInWindow(siteId, w.priorStart, w.priorEnd),
    db
      .select({
        date: analyticsDailyTable.date,
        n: sql<number>`(${analyticsDailyTable.metrics}->>'submissions')::int`,
      })
      .from(analyticsDailyTable)
      .where(
        and(
          eq(analyticsDailyTable.siteId, siteId),
          eq(analyticsDailyTable.provider, "netlify_forms"),
          gte(analyticsDailyTable.date, w.start),
          lte(analyticsDailyTable.date, w.end),
        ),
      )
      .orderBy(desc(sql`(${analyticsDailyTable.metrics}->>'submissions')::int`))
      .limit(1),
  ]);

  const peakDay = peak.length > 0 ? { date: peak[0].date, count: Number(peak[0].n ?? 0) } : null;
  return {
    window: { start: w.start, end: w.end },
    prior: { start: w.priorStart, end: w.priorEnd },
    total,
    totalPrior,
    delta: pct(total, totalPrior),
    peakDay,
    avgPerDay: days > 0 ? total / days : 0,
  };
};

export const getLeadsTimeseries = async (siteId: number, days: number): Promise<LeadsTimeseriesPoint[]> => {
  const w = getWindow(days);
  const rows = await db
    .select({
      date: analyticsDailyTable.date,
      submissions: sql<number>`coalesce((${analyticsDailyTable.metrics}->>'submissions')::int, 0)`,
    })
    .from(analyticsDailyTable)
    .where(
      and(
        eq(analyticsDailyTable.siteId, siteId),
        eq(analyticsDailyTable.provider, "netlify_forms"),
        gte(analyticsDailyTable.date, w.start),
        lte(analyticsDailyTable.date, w.end),
      ),
    )
    .orderBy(analyticsDailyTable.date);

  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, Number(r.submissions ?? 0));

  const out: LeadsTimeseriesPoint[] = [];
  for (let d = new Date(w.start); fmt(d) <= w.end; d = addDays(d, 1)) {
    const key = fmt(d);
    out.push({ date: key, forms: byDate.get(key) ?? 0 });
  }
  return out;
};

export const getLeadsByForm = async (siteId: number, days: number): Promise<LeadsByFormRow[]> => {
  const w = getWindow(days);
  const rows = await db
    .select({
      value: analyticsDimensionTable.value,
      submissions: sql<number>`coalesce(sum((${analyticsDimensionTable.metrics}->>'submissions')::int), 0)`,
    })
    .from(analyticsDimensionTable)
    .where(
      and(
        eq(analyticsDimensionTable.siteId, siteId),
        eq(analyticsDimensionTable.provider, "netlify_forms"),
        eq(analyticsDimensionTable.dimension, "form"),
        gte(analyticsDimensionTable.date, w.start),
        lte(analyticsDimensionTable.date, w.end),
      ),
    )
    .groupBy(analyticsDimensionTable.value)
    .orderBy(desc(sql`coalesce(sum((${analyticsDimensionTable.metrics}->>'submissions')::int), 0)`));

  return rows.map((r) => ({
    form: r.value,
    submissions: Number(r.submissions ?? 0),
  }));
};
