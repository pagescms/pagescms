/**
 * Catalog of known AI surfaces (LLM chat products + AI search assistants) used to
 * filter GA4 sessionSourceMedium rows. Bing has no public API for Copilot
 * citations as of early 2026 (see kanban #348 research notes), so the closest
 * "AI traffic" signal we can give clients is GA4 referrer-based.
 *
 * Note: clicks from `bing.com/chat` typically show up in GA4 with source=`bing`
 * and cannot be distinguished from regular Bing organic via sessionSourceMedium
 * alone — so Bing Copilot specifically is NOT countable here. Add `bing` to
 * this list only if Bing starts setting a distinct referrer for Copilot clicks.
 */

export type AiSurface = {
  /** Hostname to match (lowercase, no `www.` prefix). Sub-domains match too. */
  host: string;
  /** Display label for tables / charts. */
  label: string;
};

export const AI_SURFACES: readonly AiSurface[] = [
  { host: "chat.openai.com", label: "ChatGPT" },
  { host: "chatgpt.com", label: "ChatGPT" },
  { host: "copilot.microsoft.com", label: "Microsoft Copilot" },
  { host: "m365.cloud.microsoft", label: "Microsoft 365 Copilot" },
  { host: "perplexity.ai", label: "Perplexity" },
  { host: "claude.ai", label: "Claude" },
  { host: "gemini.google.com", label: "Gemini" },
  { host: "bard.google.com", label: "Bard" },
  { host: "you.com", label: "You.com" },
  { host: "phind.com", label: "Phind" },
  { host: "meta.ai", label: "Meta AI" },
  { host: "mistral.ai", label: "Mistral" },
  { host: "pi.ai", label: "Pi" },
  { host: "poe.com", label: "Poe" },
  { host: "huggingface.co", label: "HuggingFace" },
  { host: "groq.com", label: "Groq" },
] as const;

/**
 * Match a GA4 `sessionSourceMedium` value (e.g. `"chat.openai.com / referral"`)
 * to an AI surface. Returns `null` for non-AI traffic.
 */
export const matchAiSurface = (sessionSourceMedium: string): AiSurface | null => {
  const sourcePart = sessionSourceMedium.split("/")[0]?.trim() ?? "";
  if (!sourcePart) return null;
  const source = sourcePart.toLowerCase().replace(/^www\./, "");
  for (const s of AI_SURFACES) {
    if (source === s.host || source.endsWith(`.${s.host}`)) return s;
  }
  return null;
};
