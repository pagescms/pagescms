import "server-only";

import { dataforseoPost } from "./dataforseo";
import type { LlmPlatform } from "./types";

/**
 * DataForSEO "LLM Mentions" provider.
 *
 * Returns mentions of a given domain (or competitor domain) inside the answers
 * of two AI surfaces: Google AI Overview (Gemini-powered) and ChatGPT.
 * Perplexity, Claude, Gemini Direct, and Bing Copilot are NOT covered by this
 * dataset; the dashboard surfaces this caveat to clients explicitly.
 *
 * ChatGPT data is US-only (location_code 2840) — fine for our local-services
 * client base. Google AI Overview supports many locations.
 */

const ENDPOINT = "/v3/ai_optimization/llm_mentions/search/live";
const DEFAULT_LOCATION_CODE = 2840; // United States
const DEFAULT_LANGUAGE = "English";

export type MentionItem = {
  platform: LlmPlatform;
  modelName: string;
  question: string;
  answer: string;
  /** URLs the model cited or relied on. May be empty for ChatGPT (citations not always present). */
  sources: Array<{
    url: string | null;
    title: string | null;
    snippet: string | null;
  }>;
  /** Estimated AI search volume for the prompt — DataForSEO's signal of how often it's asked. */
  aiSearchVolume: number | null;
};

type RawSource = {
  type?: string;
  url?: string;
  title?: string;
  snippet?: string;
  domain?: string;
};

type RawItem = {
  platform?: LlmPlatform;
  model_name?: string;
  question?: string;
  answer?: string;
  sources?: RawSource[];
  ai_search_volume?: number;
};

type RawResult = {
  total_count?: number;
  items?: RawItem[];
};

const parseItem = (raw: RawItem, platform: LlmPlatform): MentionItem => ({
  platform: raw.platform ?? platform,
  modelName: raw.model_name ?? "",
  question: raw.question ?? "",
  answer: raw.answer ?? "",
  sources: (raw.sources ?? []).map((s) => ({
    url: s.url ?? null,
    title: s.title ?? null,
    snippet: s.snippet ?? null,
  })),
  aiSearchVolume: typeof raw.ai_search_volume === "number" ? raw.ai_search_volume : null,
});

/**
 * Pull every prompt where `domain` is mentioned by the given platform.
 *
 * The endpoint is single-shot per call. To get more than `limit` results you'd
 * paginate via `search_after_token`. For our use case (daily syncs, ~500
 * mentions per client max), one call with limit=500 is plenty.
 */
export const fetchMentions = async (
  domain: string,
  platform: LlmPlatform,
  opts: { limit?: number; locationCode?: number; minAiSearchVolume?: number } = {},
): Promise<{ items: MentionItem[]; totalCount: number; cost: number }> => {
  const limit = opts.limit ?? 500;
  const locationCode = opts.locationCode ?? DEFAULT_LOCATION_CODE;
  const filters: unknown[] = [];
  if (typeof opts.minAiSearchVolume === "number") {
    filters.push(["ai_search_volume", ">", opts.minAiSearchVolume]);
  }
  const body: unknown[] = [
    {
      target: [{ domain }],
      platform,
      location_code: locationCode,
      language_name: DEFAULT_LANGUAGE,
      ...(filters.length ? { filters } : {}),
      order_by: ["ai_search_volume,desc"],
      limit,
    },
  ];

  const json = await dataforseoPost<RawResult>(ENDPOINT, body);
  const task = json.tasks[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(
      `DataForSEO LLM Mentions task failed: ${task?.status_code} ${task?.status_message}`,
    );
  }
  const result = task.result?.[0];
  const items = (result?.items ?? []).map((i) => parseItem(i, platform));
  return {
    items,
    totalCount: result?.total_count ?? items.length,
    cost: task.cost,
  };
};

export const probeConnection = async (
  domain: string,
): Promise<{ ok: true; chatGptMentions?: number; googleMentions?: number } | { ok: false; reason: string }> => {
  try {
    if (!process.env.DATAFORSEO_USERNAME || !process.env.DATAFORSEO_PASSWORD) {
      return { ok: false, reason: "DATAFORSEO_USERNAME/DATAFORSEO_PASSWORD not set in env." };
    }
    const [google, chatGpt] = await Promise.all([
      fetchMentions(domain, "google", { limit: 1 }),
      fetchMentions(domain, "chat_gpt", { limit: 1 }),
    ]);
    return {
      ok: true,
      googleMentions: google.totalCount,
      chatGptMentions: chatGpt.totalCount,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown DataForSEO error" };
  }
};
