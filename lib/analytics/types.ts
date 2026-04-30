export type AnalyticsProvider =
  | "gsc"
  | "bing"
  | "ga4"
  | "callrail"
  | "whatconverts"
  | "netlify_forms"
  | "llm_mentions"
  | "gbp";

/** Providers that produce time-series metrics rows in analytics_daily / analytics_dimension. */
export type MetricsProvider = Exclude<AnalyticsProvider, "gbp">;

export type LlmPlatform = "google" | "chat_gpt";

/** DataForSEO LLM Mentions covers Google AI Overview (Gemini-powered) + ChatGPT only. */
export const LLM_PLATFORMS: readonly LlmPlatform[] = ["google", "chat_gpt"] as const;

export const LLM_PLATFORM_LABELS: Record<LlmPlatform, string> = {
  google: "Google AI Overview (Gemini)",
  chat_gpt: "ChatGPT",
};

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
  gbpAccountId: string | null;
  gbpLocationId: string | null;
  gbpLocationName: string | null;
  gbpConnectedAt: Date | null;
  llmMentionsEnabled: boolean;
  llmMentionsCompetitors: string[];
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

export type LlmMentionsMetrics = {
  /** Total mentions of the target across all platforms in this day. */
  totalMentions: number;
  /** Google AI Overview mentions (gemini-powered). */
  googleMentions: number;
  /** ChatGPT mentions. */
  chatGptMentions: number;
  /** Number of unique prompts where the target appeared. */
  uniquePrompts: number;
  /** Number of unique URLs from the target's domain that were cited. */
  uniqueCitedUrls: number;
};

export type ProviderMetrics = {
  gsc: GscMetrics;
  bing: BingMetrics;
  ga4: Ga4Metrics;
  callrail: CallRailMetrics;
  whatconverts: WhatConvertsMetrics;
  netlify_forms: NetlifyFormsMetrics;
  llm_mentions: LlmMentionsMetrics;
};

export type AnalyticsDailyRow<P extends MetricsProvider = MetricsProvider> = {
  id: number;
  siteId: number;
  provider: P;
  date: string;
  metrics: ProviderMetrics[P];
  fetchedAt: Date;
};

export type AnalyticsDimensionRow<P extends MetricsProvider = MetricsProvider> = {
  id: number;
  siteId: number;
  provider: P;
  date: string;
  dimension: string;
  value: string;
  metrics: ProviderMetrics[P];
  fetchedAt: Date;
};

export type ActivityKind =
  | "blog_published"
  | "content_updated"
  | "deploy"
  | "backlink_gained"
  | "schema_added"
  | "citation_built"
  | "gbp_post"
  | "photo_added"
  | "review_response"
  | "manual";

export type ActivitySource = "github" | "netlify" | "dataforseo" | "agency";

export type ActivityRow = {
  id: number;
  siteId: number;
  date: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  url: string | null;
  source: ActivitySource;
  metadata: Record<string, unknown>;
  externalId: string | null;
  createdAt: Date;
};

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  blog_published: "Blog post",
  content_updated: "Content update",
  deploy: "Deployment",
  backlink_gained: "Backlink gained",
  schema_added: "Schema markup",
  citation_built: "Citation built",
  gbp_post: "GBP post",
  photo_added: "Photos added",
  review_response: "Review response",
  manual: "Activity",
};

export const PROVIDER_LABELS: Record<AnalyticsProvider, string> = {
  gsc: "Google Search Console",
  bing: "Bing Webmaster Tools",
  ga4: "Google Analytics 4",
  callrail: "CallRail",
  whatconverts: "WhatConverts",
  netlify_forms: "Netlify Forms",
  llm_mentions: "AI Citations (DataForSEO)",
  gbp: "Google Business Profile",
};
