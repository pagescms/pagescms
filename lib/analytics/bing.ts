import "server-only";

import type { BingMetrics } from "./types";

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

const getApiKey = () => {
  const key = process.env.BING_WEBMASTER_API_KEY;
  if (!key) throw new Error("BING_WEBMASTER_API_KEY is not set.");
  return key;
};

type RequestInit = { method: "GET" | "POST"; body?: unknown };

const request = async <T>(endpoint: string, init: RequestInit = { method: "GET" }): Promise<T> => {
  const apiKey = getApiKey();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${BING_API_BASE}/${endpoint}${separator}apikey=${apiKey}`;

  const response = await fetch(url, {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bing ${init.method} ${endpoint} failed ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { d?: T } | T;
  return (payload && typeof payload === "object" && "d" in payload ? (payload.d as T) : (payload as T));
};

export type BingSite = {
  Url: string;
  IsVerified: boolean;
  AuthenticationCode?: string;
};

export const getSites = async () => {
  return await request<BingSite[]>("GetUserSites");
};

/**
 * Bing represents dates as /Date(epochMillis±TZOFFSET)/ in JSON (the TZ offset
 * is optional and, when present, looks like -0700). Convert to YYYY-MM-DD in UTC.
 */
const parseBingDate = (raw: string | undefined): string => {
  if (!raw) return "";
  const m = /\/Date\((\d+)(?:[+-]\d{4})?\)\//.exec(raw);
  if (!m) return raw.slice(0, 10);
  return new Date(parseInt(m[1], 10)).toISOString().slice(0, 10);
};

export type BingRankRow = {
  Clicks: number;
  Impressions: number;
  Query?: string;
  Date?: string;
  AvgClickPosition?: number;
  AvgImpressionPosition?: number;
};

export const getRankAndTrafficStats = async (siteUrl: string): Promise<BingRankRow[]> => {
  const encoded = encodeURIComponent(siteUrl);
  return await request<BingRankRow[]>(`GetRankAndTrafficStats?siteUrl=${encoded}`);
};

export const getQueryStats = async (siteUrl: string): Promise<BingRankRow[]> => {
  const encoded = encodeURIComponent(siteUrl);
  return await request<BingRankRow[]>(`GetQueryStats?siteUrl=${encoded}`);
};

export type BingPageStatsRow = {
  Clicks: number;
  Impressions: number;
  Page?: string;
};

export const getPageStats = async (siteUrl: string): Promise<BingPageStatsRow[]> => {
  const encoded = encodeURIComponent(siteUrl);
  return await request<BingPageStatsRow[]>(`GetPageStats?siteUrl=${encoded}`);
};

/**
 * Fetch daily timeseries by grouping GetRankAndTrafficStats rows by their Date field.
 * Bing returns time-series data with /Date(ms)/ timestamps per row.
 */
export const fetchDailyTimeseries = async (
  siteUrl: string,
): Promise<Array<{ date: string; metrics: BingMetrics }>> => {
  const rows = await getRankAndTrafficStats(siteUrl);
  const byDate = new Map<string, BingMetrics>();
  for (const r of rows) {
    const date = parseBingDate(r.Date);
    if (!date) continue;
    const prev = byDate.get(date) ?? { clicks: 0, impressions: 0 };
    byDate.set(date, {
      clicks: prev.clicks + (r.Clicks ?? 0),
      impressions: prev.impressions + (r.Impressions ?? 0),
    });
  }
  return Array.from(byDate.entries())
    .map(([date, metrics]) => ({ date, metrics }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
};

export const fetchTopQueries = async (
  siteUrl: string,
): Promise<Array<{ value: string; metrics: BingMetrics }>> => {
  const rows = await getQueryStats(siteUrl);
  return rows
    .filter((r) => r.Query)
    .map((r) => ({
      value: r.Query as string,
      metrics: { clicks: r.Clicks ?? 0, impressions: r.Impressions ?? 0 },
    }));
};

export const fetchTopPages = async (
  siteUrl: string,
): Promise<Array<{ value: string; metrics: BingMetrics }>> => {
  const rows = await getPageStats(siteUrl);
  return rows
    .filter((r) => r.Page)
    .map((r) => ({
      value: r.Page as string,
      metrics: { clicks: r.Clicks ?? 0, impressions: r.Impressions ?? 0 },
    }));
};

export const probeConnection = async (
  siteUrl: string,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  try {
    const sites = await getSites();
    const normalized = siteUrl.replace(/\/+$/, "");
    const match = sites.find((s) => s.Url.replace(/\/+$/, "") === normalized);
    if (!match) {
      return { ok: false, reason: `Site ${siteUrl} is not verified in Bing Webmaster Tools.` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown Bing error" };
  }
};
