export type AnalyticsProvider =
  | "gsc"
  | "bing"
  | "ga4"
  | "callrail"
  | "whatconverts"
  | "netlify_forms";

export type CallTrackingProvider = "callrail" | "whatconverts" | null;

export type AnalyticsSiteRow = {
  id: number;
  owner: string;
  repo: string;
  timezone: string;
  gscProperty: string | null;
  bingSiteUrl: string | null;
  ga4PropertyId: string | null;
  callTrackingProvider: CallTrackingProvider;
  callrailAccountId: string | null;
  callrailCompanyId: string | null;
  whatconvertsAccountId: string | null;
  whatconvertsProfileId: string | null;
  netlifySiteId: string | null;
  digestEnabled: boolean;
  digestRecipients: string[];
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GscMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type BingMetrics = {
  clicks: number;
  impressions: number;
};

export type Ga4Metrics = {
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
  screenPageViews: number;
  conversions: number;
};

export type CallRailMetrics = {
  calls: number;
  firstTimeCalls: number;
  qualifiedCalls: number;
  avgDurationSeconds: number;
};

export type WhatConvertsMetrics = {
  leads: number;
  phoneCalls: number;
  webForms: number;
  quotableLeads: number;
  salesValueCents: number;
};

export type NetlifyFormsMetrics = {
  submissions: number;
};

export type ProviderMetrics = {
  gsc: GscMetrics;
  bing: BingMetrics;
  ga4: Ga4Metrics;
  callrail: CallRailMetrics;
  whatconverts: WhatConvertsMetrics;
  netlify_forms: NetlifyFormsMetrics;
};

export type AnalyticsDailyRow<P extends AnalyticsProvider = AnalyticsProvider> = {
  id: number;
  siteId: number;
  provider: P;
  date: string;
  metrics: ProviderMetrics[P];
  fetchedAt: Date;
};

export type AnalyticsDimensionRow<P extends AnalyticsProvider = AnalyticsProvider> = {
  id: number;
  siteId: number;
  provider: P;
  date: string;
  dimension: string;
  value: string;
  metrics: ProviderMetrics[P];
  fetchedAt: Date;
};

export const PROVIDER_LABELS: Record<AnalyticsProvider, string> = {
  gsc: "Google Search Console",
  bing: "Bing Webmaster Tools",
  ga4: "Google Analytics 4",
  callrail: "CallRail",
  whatconverts: "WhatConverts",
  netlify_forms: "Netlify Forms",
};
