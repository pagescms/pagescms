export const maxDuration = 30;

import { type NextRequest, NextResponse } from "next/server";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import {
  getLlmMentionsSummary,
  getTopLlmCitedUrls,
  getTopLlmPrompts,
} from "@/lib/analytics/queries";
import { toErrorResponse } from "@/lib/api-error";

const parseDays = (s: string | null) => {
  const n = s ? parseInt(s, 10) : 28;
  return Number.isFinite(n) && n > 0 && n <= 480 ? n : 28;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const params = await context.params;
    const { site } = await getRepoAnalyticsContext(params);
    if (!site) {
      return NextResponse.json({
        status: "ok",
        enabled: false,
        summary: null,
        prompts: [],
        citedUrls: [],
      });
    }

    if (!site.llmMentionsEnabled) {
      return NextResponse.json({
        status: "ok",
        enabled: false,
        summary: null,
        prompts: [],
        citedUrls: [],
      });
    }

    const days = parseDays(request.nextUrl.searchParams.get("days"));
    const [summary, prompts, citedUrls] = await Promise.all([
      getLlmMentionsSummary(site.id, days),
      getTopLlmPrompts(site.id, days, 50),
      getTopLlmCitedUrls(site.id, days, 50),
    ]);

    return NextResponse.json({
      status: "ok",
      enabled: true,
      summary,
      prompts,
      citedUrls,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
