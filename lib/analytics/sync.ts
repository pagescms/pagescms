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
import * as llmMentions from "./llm-mentions";
import * as activity from "./activity";
import type { AnalyticsProvider, AnalyticsSiteRow, LlmPlatform } from "./types";

type ProviderResult = { ok: true; dates?: number; dimensions?: number } | { ok: false; reason: string };

export type SyncResult = {
  siteId: number;
  owner: string;
  repo: string;
  gsc: ProviderResult | null;
  bing: ProviderResult | null;
  ga4: ProviderResult | null;
  netlifyForms: ProviderResult | null;
  llmMentions: ProviderResult | null;
  activity: ProviderResult | null;
};

/**
 * Derive a bare hostname (e.g. "terzoroofing.com") from a site's GSC property.
 * Supports both `sc-domain:terzoroofing.com` and `https://terzoroofing.com/`.
 * Returns null if no domain can be derived.
 */
const derivePrimaryDomain = (site: AnalyticsSiteRow): string | null => {
  if (site.gscProperty) {
    if (site.gscProperty.startsWith("sc-domain:")) {
      return site.gscProperty.slice("sc-domain:".length).trim() || null;
    }
    try {
      return new URL(site.gscProperty).hostname.replace(/^www\./, "") || null;
    } catch {
      // fall through
    }
  }
  if (site.bingSiteUrl) {
    try {
      return new URL(site.bingSiteUrl).hostname.replace(/^www\./, "") || null;
    } catch {
      // fall through
    }
  }
  return null;
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
  rows: Array<{ date: string; metrics: Record<string, unknown> }>,
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
  rows: Array<{ value: string; metrics: Record<string, unknown> }>,
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
    activity: null,
    llmMentions: null,
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

  if (site.llmMentionsEnabled) {
    const domain = derivePrimaryDomain(site);
    if (!domain) {
      result.llmMentions = { ok: false, reason: "Could not derive a primary domain (gscProperty/bingSiteUrl missing or invalid)." };
    } else {
      try {
        const platforms: LlmPlatform[] = ["google", "chat_gpt"];
        const fetched = await Promise.all(
          platforms.map((p) => llmMentions.fetchMentions(domain, p, { limit: 500 })),
        );

        // Aggregate per-prompt counts (the same prompt can appear in both platforms).
        type PromptAgg = { google: number; chat_gpt: number; aiSearchVolume: number; firstAnswerSnippet: string; firstSourceUrl: string | null };
        const perPrompt = new Map<string, PromptAgg>();
        const perCitedUrl = new Map<string, { google: number; chat_gpt: number }>();
        let totalMentions = 0;
        let googleMentions = 0;
        let chatGptMentions = 0;

        for (const { items } of fetched) {
          for (const item of items) {
            totalMentions += 1;
            if (item.platform === "google") googleMentions += 1;
            if (item.platform === "chat_gpt") chatGptMentions += 1;

            const key = item.question.trim().toLowerCase();
            if (!key) continue;
            const existing = perPrompt.get(key) ?? {
              google: 0,
              chat_gpt: 0,
              aiSearchVolume: 0,
              firstAnswerSnippet: item.answer.slice(0, 280),
              firstSourceUrl: item.sources[0]?.url ?? null,
            };
            existing[item.platform] += 1;
            if (typeof item.aiSearchVolume === "number" && item.aiSearchVolume > existing.aiSearchVolume) {
              existing.aiSearchVolume = item.aiSearchVolume;
            }
            perPrompt.set(key, existing);

            for (const src of item.sources) {
              if (!src.url) continue;
              const u = src.url.toLowerCase();
              const cu = perCitedUrl.get(u) ?? { google: 0, chat_gpt: 0 };
              cu[item.platform] += 1;
              perCitedUrl.set(u, cu);
            }
          }
        }

        await upsertDailyRows(site.id, "llm_mentions", [
          {
            date: endDate,
            metrics: {
              totalMentions,
              googleMentions,
              chatGptMentions,
              uniquePrompts: perPrompt.size,
              uniqueCitedUrls: perCitedUrl.size,
            },
          },
        ]);

        const promptRows = [...perPrompt.entries()].map(([prompt, agg]) => ({
          value: prompt.slice(0, 400),
          metrics: {
            googleMentions: agg.google,
            chatGptMentions: agg.chat_gpt,
            aiSearchVolume: agg.aiSearchVolume,
            // Persist a small surrounding context so the dashboard can show *why* the prompt counts.
            answerSnippet: agg.firstAnswerSnippet,
            firstSourceUrl: agg.firstSourceUrl,
          },
        }));
        await upsertDimensionRows(site.id, "llm_mentions", endDate, "prompt", promptRows);

        const urlRows = [...perCitedUrl.entries()].map(([url, agg]) => ({
          value: url.slice(0, 400),
          metrics: {
            googleMentions: agg.google,
            chatGptMentions: agg.chat_gpt,
          },
        }));
        await upsertDimensionRows(site.id, "llm_mentions", endDate, "cited_url", urlRows);

        result.llmMentions = {
          ok: true,
          dates: 1,
          dimensions: promptRows.length + urlRows.length,
        };
      } catch (error) {
        result.llmMentions = {
          ok: false,
          reason: error instanceof Error ? error.message : "unknown DataForSEO error",
        };
      }
    }
  }

  // Activity feed — backfill 30 days on every sync (idempotent via dedup).
  // GitHub commits + Netlify deploys.
  try {
    let activityCount = 0;
    const sinceDate = new Date();
    sinceDate.setUTCDate(sinceDate.getUTCDate() - 30);
    const sinceIso = sinceDate.toISOString();

    activityCount += await activity.syncGithubCommits(site.id, site.owner, site.repo, sinceIso).catch((err) => {
      console.error(`activity.github failed for ${site.owner}/${site.repo}:`, err);
      return 0;
    });

    if (site.netlifySiteId) {
      activityCount += await activity.syncNetlifyDeploys(site.id, site.netlifySiteId).catch((err) => {
        console.error(`activity.netlify failed for ${site.owner}/${site.repo}:`, err);
        return 0;
      });
    }

    result.activity = { ok: true, dimensions: activityCount };
  } catch (error) {
    result.activity = {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown activity sync error",
    };
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
