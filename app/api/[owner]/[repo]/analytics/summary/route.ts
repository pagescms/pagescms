export const maxDuration = 30;

import { type NextRequest, NextResponse } from "next/server";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import { getSummary } from "@/lib/analytics/queries";
import { toErrorResponse } from "@/lib/api-error";
import type { AnalyticsProvider } from "@/lib/analytics/types";

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
    if (!site) return NextResponse.json({ status: "ok", summary: null });

    const sp = request.nextUrl.searchParams;
    const days = parseDays(sp.get("days"));
    const provider = (sp.get("provider") ?? "combined") as AnalyticsProvider | "combined";

    const summary = await getSummary(site.id, days, provider);
    return NextResponse.json({ status: "ok", summary });
  } catch (error) {
    return toErrorResponse(error);
  }
}
