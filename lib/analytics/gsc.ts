import "server-only";

import { google, type searchconsole_v1 } from "googleapis";
import type { GscMetrics } from "./types";

const GSC_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
];

const decodeServiceAccount = () => {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_B64 is not set.");
  const json = Buffer.from(b64, "base64").toString("utf8");
  return JSON.parse(json) as { client_email: string; private_key: string };
};

const getClient = (): searchconsole_v1.Searchconsole => {
  const auth = new google.auth.GoogleAuth({
    credentials: decodeServiceAccount(),
    scopes: GSC_SCOPES,
  });
  return google.searchconsole({ version: "v1", auth });
};

export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const normalizeRow = (
  row: searchconsole_v1.Schema$ApiDataRow,
): GscRow => ({
  keys: row.keys ?? [],
  clicks: row.clicks ?? 0,
  impressions: row.impressions ?? 0,
  ctr: row.ctr ?? 0,
  position: row.position ?? 0,
});

export const listSites = async () => {
  const client = getClient();
  const response = await client.sites.list();
  return (response.data.siteEntry ?? []).map((s) => ({
    siteUrl: s.siteUrl ?? "",
    permissionLevel: s.permissionLevel ?? "",
  }));
};

export const getSite = async (siteUrl: string) => {
  const client = getClient();
  const response = await client.sites.get({ siteUrl });
  return {
    siteUrl: response.data.siteUrl ?? siteUrl,
    permissionLevel: response.data.permissionLevel ?? "",
  };
};

export type QueryOptions = {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: Array<"date" | "query" | "page" | "country" | "device" | "searchAppearance">;
  rowLimit?: number;
  type?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
};

export const querySearchAnalytics = async (options: QueryOptions): Promise<GscRow[]> => {
  const client = getClient();
  const response = await client.searchanalytics.query({
    siteUrl: options.siteUrl,
    requestBody: {
      startDate: options.startDate,
      endDate: options.endDate,
      dimensions: options.dimensions ?? [],
      rowLimit: options.rowLimit ?? 1000,
      type: options.type ?? "web",
    },
  });
  return (response.data.rows ?? []).map(normalizeRow);
};

/**
 * Daily timeseries: one row per date between startDate and endDate inclusive.
 */
export const fetchDailyTimeseries = async (
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; metrics: GscMetrics }>> => {
  const rows = await querySearchAnalytics({
    siteUrl,
    startDate,
    endDate,
    dimensions: ["date"],
    rowLimit: 5000,
  });
  return rows.map((r) => ({
    date: r.keys[0],
    metrics: {
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    },
  }));
};

/**
 * Top N rows for a given dimension, aggregated over the full window.
 */
export const fetchDimensionRollup = async (
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimension: "query" | "page" | "country" | "device",
  rowLimit = 500,
): Promise<Array<{ value: string; metrics: GscMetrics }>> => {
  const rows = await querySearchAnalytics({
    siteUrl,
    startDate,
    endDate,
    dimensions: [dimension],
    rowLimit,
  });
  return rows.map((r) => ({
    value: r.keys[0],
    metrics: {
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    },
  }));
};

/**
 * Lightweight probe for the test-connection endpoint. Returns true if we can
 * query a tiny window, false otherwise with a reason string.
 */
export const probeConnection = async (
  siteUrl: string,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  try {
    await getSite(siteUrl);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown GSC error",
    };
  }
};
