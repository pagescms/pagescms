export const maxDuration = 30;

import { type NextRequest, NextResponse } from "next/server";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import {
  getGa4Summary,
  getGa4Timeseries,
  getGa4TopSources,
  getGa4TopLandings,
  getGa4AiReferrals,
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
        summary: null,
        points: [],
        sources: [],
        landings: [],
        aiReferrals: null,
      });
    }

    const days = parseDays(request.nextUrl.searchParams.get("days"));
    const [summary, points, sources, landings, aiReferrals] = await Promise.all([
      getGa4Summary(site.id, days),
      getGa4Timeseries(site.id, days),
      getGa4TopSources(site.id, days, 50),
      getGa4TopLandings(site.id, days, 50),
      getGa4AiReferrals(site.id, days),
    ]);

    return NextResponse.json({ status: "ok", summary, points, sources, landings, aiReferrals });
  } catch (error) {
    return toErrorResponse(error);
  }
}
