import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsDailyTable, analyticsDimensionTable } from "@/db/schema";
import type { AnalyticsProvider } from "./types";

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
