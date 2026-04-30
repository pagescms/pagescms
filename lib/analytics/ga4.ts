import "server-only";

import { google, type analyticsdata_v1beta } from "googleapis";
import type { Ga4Metrics } from "./types";

const GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

const decodeServiceAccount = () => {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_B64 is not set.");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
};

const getClient = (): analyticsdata_v1beta.Analyticsdata => {
  const auth = new google.auth.GoogleAuth({
    credentials: decodeServiceAccount(),
    scopes: GA4_SCOPES,
  });
  return google.analyticsdata({ version: "v1beta", auth });
};

/**
 * Accepts either "properties/123456789" or raw "123456789" and returns the
 * canonical "properties/123456789" form that runReport expects.
 */
const normalizeProperty = (property: string): string =>
  property.startsWith("properties/") ? property : `properties/${property.replace(/^properties\//, "")}`;

/** GA4 returns dates as YYYYMMDD with no hyphens. Convert to YYYY-MM-DD. */
const normalizeDate = (d: string): string =>
  d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;

const GA4_METRIC_NAMES = [
  "sessions",
  "activeUsers",
  "engagedSessions",
  "screenPageViews",
  "conversions",
] as const;

const parseMetrics = (values: Array<analyticsdata_v1beta.Schema$MetricValue> | undefined): Ga4Metrics => {
  const arr = values ?? [];
  const pick = (i: number) => Number(arr[i]?.value ?? 0);
  return {
    sessions: pick(0),
    activeUsers: pick(1),
    engagedSessions: pick(2),
    screenPageViews: pick(3),
    conversions: pick(4),
  };
};

export const fetchDailyTimeseries = async (
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; metrics: Ga4Metrics }>> => {
  const client = getClient();
  const response = await client.properties.runReport({
    property: normalizeProperty(propertyId),
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: GA4_METRIC_NAMES.map((name) => ({ name })),
      limit: "50000",
    },
  });
  return (response.data.rows ?? []).map((row) => ({
    date: normalizeDate(row.dimensionValues?.[0]?.value ?? ""),
    metrics: parseMetrics(row.metricValues),
  }));
};

export const fetchDimensionRollup = async (
  propertyId: string,
  startDate: string,
  endDate: string,
  dimension: "sessionSourceMedium" | "landingPage" | "deviceCategory" | "pagePath",
  limit = 500,
): Promise<Array<{ value: string; metrics: Ga4Metrics }>> => {
  const client = getClient();
  const response = await client.properties.runReport({
    property: normalizeProperty(propertyId),
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimension }],
      metrics: GA4_METRIC_NAMES.map((name) => ({ name })),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
    },
  });
  return (response.data.rows ?? []).map((row) => ({
    value: row.dimensionValues?.[0]?.value ?? "",
    metrics: parseMetrics(row.metricValues),
  }));
};

export const probeConnection = async (
  propertyId: string,
): Promise<{ ok: true; sessions?: number } | { ok: false; reason: string }> => {
  try {
    const client = getClient();
    const response = await client.properties.runReport({
      property: normalizeProperty(propertyId),
      requestBody: {
        dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
        metrics: [{ name: "sessions" }],
        limit: "1",
      },
    });
    const sessions = Number(response.data.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    return { ok: true, sessions };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown GA4 error" };
  }
};
