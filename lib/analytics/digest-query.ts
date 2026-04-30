import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsDailyTable, analyticsDimensionTable } from "@/db/schema";

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

/**
 * ISO weeks, Monday-start, in UTC. Returns the two most recent complete weeks
 * ending before today. "This week" = last 7 full days; "Prior week" = the 7
 * days before that.
 */
export const getWeekRanges = () => {
  const today = new Date();
  const end = addDays(today, -1);
  const start = addDays(end, -6);
  const priorEnd = addDays(start, -1);
  const priorStart = addDays(priorEnd, -6);
  return {
    current: { start: fmt(start), end: fmt(end) },
    prior: { start: fmt(priorStart), end: fmt(priorEnd) },
  };
};

export type DigestKpi = {
  current: number;
  previous: number;
  delta: number; // fraction: 0.25 = +25%
};

export type DigestNumberLabel = "clicks" | "impressions" | "sessions" | "position";

export type DigestMover = {
  query: string;
  current: number;
  previous: number;
  delta: number;
};

export type DigestData = {
  window: { currentStart: string; currentEnd: string; priorStart: string; priorEnd: string };
  clicks: DigestKpi;
  impressions: DigestKpi;
  sessions: DigestKpi | null;
  position: DigestKpi | null; // avg position (lower is better)
  movers: DigestMover[];
};

const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 1 : 0) : (a - b) / b);

const aggSum = async (
  siteId: number,
  provider: "gsc" | "bing" | "ga4",
  field: "clicks" | "impressions" | "sessions",
  start: string,
  end: string,
) => {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>${field})::int), 0)`,
    })
    .from(analyticsDailyTable)
    .where(
      and(
        eq(analyticsDailyTable.siteId, siteId),
        eq(analyticsDailyTable.provider, provider),
        gte(analyticsDailyTable.date, start),
        lte(analyticsDailyTable.date, end),
      ),
    );
  return Number(rows[0]?.total ?? 0);
};

const aggGscPosition = async (siteId: number, start: string, end: string) => {
  const rows = await db
    .select({
      pos_sum: sql<number>`coalesce(sum((${analyticsDailyTable.metrics}->>'position')::numeric * (${analyticsDailyTable.metrics}->>'impressions')::int), 0)`,
      pos_weight: sql<number>`coalesce(sum(case when (${analyticsDailyTable.metrics}->>'position') is not null then (${analyticsDailyTable.metrics}->>'impressions')::int else 0 end), 0)`,
    })
    .from(analyticsDailyTable)
    .where(
      and(
        eq(analyticsDailyTable.siteId, siteId),
        eq(analyticsDailyTable.provider, "gsc"),
        gte(analyticsDailyTable.date, start),
        lte(analyticsDailyTable.date, end),
      ),
    );
  const w = Number(rows[0]?.pos_weight ?? 0);
  const s = Number(rows[0]?.pos_sum ?? 0);
  return w > 0 ? s / w : null;
};

const getDigestMovers = async (
  siteId: number,
  current: { start: string; end: string },
  prior: { start: string; end: string },
): Promise<DigestMover[]> => {
  // Both windows' dimension snapshots are written with date = their respective end.
  // Pull the two snapshots by querying each end date separately.
  const fetchSnapshot = async (date: string) => {
    const rows = await db
      .select({
        value: analyticsDimensionTable.value,
        clicks: sql<number>`coalesce(sum((${analyticsDimensionTable.metrics}->>'clicks')::int), 0)`,
      })
      .from(analyticsDimensionTable)
      .where(
        and(
          eq(analyticsDimensionTable.siteId, siteId),
          eq(analyticsDimensionTable.provider, "gsc"),
          eq(analyticsDimensionTable.dimension, "query"),
          eq(analyticsDimensionTable.date, date),
        ),
      )
      .groupBy(analyticsDimensionTable.value)
      .orderBy(desc(sql`coalesce(sum((${analyticsDimensionTable.metrics}->>'clicks')::int), 0)`))
      .limit(500);
    return new Map(rows.map((r) => [r.value, Number(r.clicks ?? 0)]));
  };

  const cur = await fetchSnapshot(current.end);
  const prev = await fetchSnapshot(prior.end);

  if (cur.size === 0 && prev.size === 0) return [];

  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const movers: DigestMover[] = [];
  for (const q of keys) {
    const c = cur.get(q) ?? 0;
    const p = prev.get(q) ?? 0;
    if (c === 0 && p === 0) continue;
    movers.push({ query: q, current: c, previous: p, delta: pct(c, p) });
  }
  movers.sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous));
  return movers.slice(0, 5);
};

export const getDigestData = async (siteId: number): Promise<DigestData> => {
  const { current, prior } = getWeekRanges();

  const [clicksCur, clicksPrev, imprCur, imprPrev, sessCur, sessPrev, posCur, posPrev, movers] = await Promise.all([
    aggSum(siteId, "gsc", "clicks", current.start, current.end),
    aggSum(siteId, "gsc", "clicks", prior.start, prior.end),
    aggSum(siteId, "gsc", "impressions", current.start, current.end),
    aggSum(siteId, "gsc", "impressions", prior.start, prior.end),
    aggSum(siteId, "ga4", "sessions", current.start, current.end),
    aggSum(siteId, "ga4", "sessions", prior.start, prior.end),
    aggGscPosition(siteId, current.start, current.end),
    aggGscPosition(siteId, prior.start, prior.end),
    getDigestMovers(siteId, current, prior),
  ]);

  return {
    window: {
      currentStart: current.start,
      currentEnd: current.end,
      priorStart: prior.start,
      priorEnd: prior.end,
    },
    clicks: { current: clicksCur, previous: clicksPrev, delta: pct(clicksCur, clicksPrev) },
    impressions: { current: imprCur, previous: imprPrev, delta: pct(imprCur, imprPrev) },
    sessions:
      sessCur === 0 && sessPrev === 0
        ? null
        : { current: sessCur, previous: sessPrev, delta: pct(sessCur, sessPrev) },
    position:
      posCur == null && posPrev == null
        ? null
        : {
            current: posCur ?? 0,
            previous: posPrev ?? 0,
            delta: pct(posPrev ?? 0, posCur ?? 0), // inverted — lower position = better
          },
    movers,
  };
};
