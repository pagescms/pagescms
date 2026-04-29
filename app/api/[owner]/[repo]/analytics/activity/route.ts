export const maxDuration = 30;

import { type NextRequest, NextResponse } from "next/server";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import { getActivityFeed } from "@/lib/analytics/activity";
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
      return NextResponse.json({ status: "ok", entries: [] });
    }

    const days = parseDays(request.nextUrl.searchParams.get("days"));
    const entries = await getActivityFeed(site.id, days);
    return NextResponse.json({ status: "ok", entries });
  } catch (error) {
    return toErrorResponse(error);
  }
}
