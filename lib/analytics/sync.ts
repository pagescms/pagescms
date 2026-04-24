import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsDailyTable,
  analyticsDimensionTable,
  analyticsSiteTable,
} from "@/db/schema";
import * as gsc from "./gsc";
import * as bing from "./bing";
import * as ga4 from "./ga4";
import * as netlifyForms from "./netlify-forms";
import type { AnalyticsProvider, AnalyticsSiteRow } from "./types";

type ProviderResult = { ok: true; dates?: number; dimensions?: number } | { ok: false; reason: string };

export type SyncResult = {
  siteId: number;
  owner: string;
  repo: string;
  gsc: ProviderResult | null;
  bing: ProviderResult | null;
  ga4: ProviderResult | null;
  netlifyForms: ProviderResult | null;
};

const formatDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

const upsertDailyRows = async (
  siteId: number,
  provider: AnalyticsProvider,
  rows: Array<{ date: string; metrics: Record<string, number> }>,
) => {
  if (rows.length === 0) return;
  await db
    .insert(analyticsDailyTable)
    .values(rows.map((r) => ({ siteId, provider, date: r.date, metrics: r.metrics })))
    .onConflictDoUpdate({
      target: [analyticsDailyTable.siteId, analyticsDailyTable.provider, analyticsDailyTable.date],
      set: { metrics: sql`excluded.metrics`, fetchedAt: new Date() },
    });
};

const upsertDimensionRows = async (
  siteId: number,
  provider: AnalyticsProvider,
  date: string,
  dimension: string,
  rows: Array<{ value: string; metrics: Record<string, number> }>,
) => {
  if (rows.length === 0) return;
  await db
    .insert(analyticsDimensionTable)
    .values(
      rows.map((r) => ({
        siteId,
        provider,
        date,
        dimension,
        value: r.value,
        metrics: r.metrics,
      })),
    )
    .onConflictDoUpdate({
      target: [
        analyticsDimensionTable.siteId,
        analyticsDimensionTable.provider,
        analyticsDimensionTable.date,
        analyticsDimensionTable.dimension,
        analyticsDimensionTable.value,
      ],
      set: { metrics: sql`excluded.metrics`, fetchedAt: new Date() },
    });
};

/**
 * Sync one site's analytics_daily + analytics_dimension rows for every
 * configured provider. `backfillDays` controls the GSC window (default 5
 * captures the 3-day GSC lag plus a small safety margin). Pass 90 on first run.
 */
export const syncSite = async (
  site: AnalyticsSiteRow,
  options: { backfillDays?: number } = {},
): Promise<SyncResult> => {
  const { backfillDays = 5 } = options;
  const today = new Date();
  const endDate = formatDate(addDays(today, -3));
  const startDate = formatDate(addDays(new Date(endDate), -backfillDays));

  const result: SyncResult = {
    siteId: site.id,
    owner: site.owner,
    repo: site.repo,
    gsc: null,
    bing: null,
    ga4: null,
    netlifyForms: null,
  };

  if (site.gscProperty) {
    try {
      const daily = await gsc.fetchDailyTimeseries(site.gscProperty, startDate, endDate);
      await upsertDailyRows(site.id, "gsc", daily);

      const queries = await gsc.fetchDimensionRollup(site.gscProperty, startDate, endDate, "query", 500);
      await upsertDimensionRows(site.id, "gsc", endDate, "query", queries);

      const pages = await gsc.fetchDimensionRollup(site.gscProperty, startDate, endDate, "page", 500);
      await upsertDimensionRows(site.id, "gsc", endDate, "page", pages);

      result.gsc = { ok: true, dates: daily.length, dimensions: queries.length + pages.length };
    } catch (error) {
      result.gsc = {
        ok: false,
        reason: error instanceof Error ? error.message : "unknown GSC error",
      };
    }
  }

  if (site.bingSiteUrl) {
    try {
      const daily = await bing.fetchDailyTimeseries(site.bingSiteUrl);
      await upsertDailyRows(site.id, "bing", daily);

      const queries = await bing.fetchTopQueries(site.bingSiteUrl);
      await upsertDimensionRows(site.id, "bing", endDate, "query", queries);

      const pages = await bing.fetchTopPages(site.bingSiteUrl);
      await upsertDimensionRows(site.id, "bing", endDate, "page", pages);

      result.bing = { ok: true, dates: daily.length, dimensions: queries.length + pages.length };
    } catch (error) {
      result.bing = {
        ok: false,
        reason: error instanceof Error ? error.message : "unknown Bing error",
      };
    }
  }

  if (site.ga4PropertyId) {
    try {
      const daily = await ga4.fetchDailyTimeseries(site.ga4PropertyId, startDate, endDate);
      await upsertDailyRows(site.id, "ga4", daily);

      const sources = await ga4.fetchDimensionRollup(site.ga4PropertyId, startDate, endDate, "sessionSourceMedium", 200);
      await upsertDimensionRows(site.id, "ga4", endDate, "source", sources);

      const landings = await ga4.fetchDimensionRollup(site.ga4PropertyId, startDate, endDate, "landingPage", 200);
      await upsertDimensionRows(site.id, "ga4", endDate, "landing_page", landings);

      result.ga4 = { ok: true, dates: daily.length, dimensions: sources.length + landings.length };
    } catch (error) {
      result.ga4 = {
        ok: false,
        reason: error instanceof Error ? error.message : "unknown GA4 error",
      };
    }
  }

  if (site.netlifySiteId) {
    try {
      const daily = await netlifyForms.fetchDailySubmissions(site.netlifySiteId, startDate, endDate);
      await upsertDailyRows(site.id, "netlify_forms", daily);

      const forms = await netlifyForms.fetchPerFormBreakdown(site.netlifySiteId, startDate, endDate);
      await upsertDimensionRows(site.id, "netlify_forms", endDate, "form", forms);

      result.netlifyForms = { ok: true, dates: daily.length, dimensions: forms.length };
    } catch (error) {
      result.netlifyForms = {
        ok: false,
        reason: error instanceof Error ? error.message : "unknown Netlify error",
      };
    }
  }

  await db
    .update(analyticsSiteTable)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(analyticsSiteTable.id, site.id));

  return result;
};

/**
 * Sync every analytics_site row (used by the cron job).
 */
export const syncAllSites = async (
  options: { backfillDays?: number } = {},
): Promise<SyncResult[]> => {
  const sites = (await db.select().from(analyticsSiteTable)) as unknown as AnalyticsSiteRow[];
  const results: SyncResult[] = [];
  for (const site of sites) {
    results.push(await syncSite(site, options));
  }
  return results;
};
