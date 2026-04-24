export const maxDuration = 300;

import { type NextRequest, NextResponse } from "next/server";
import { syncAllSites, syncSite } from "@/lib/analytics/sync";
import { db } from "@/db";
import { analyticsSiteTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Daily analytics sync. Runs on Vercel Cron at 04:00 UTC; also callable by hand
 * with `Authorization: Bearer $CRON_SECRET` for ad-hoc backfills.
 *
 * Query params:
 *   - owner + repo: sync a single site only (ad-hoc)
 *   - backfillDays:  override default 5-day window (use 90 on first run)
 */
const isAuthorized = (request: NextRequest) => {
  // Vercel Cron sends this header automatically when invoking the route.
  // See https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
  const fromVercelCron = request.headers.get("user-agent")?.includes("vercel-cron");
  if (fromVercelCron) return true;

  const header = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
};

const handler = async (request: NextRequest) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const backfillParam = searchParams.get("backfillDays");
  const backfillDays = backfillParam ? parseInt(backfillParam, 10) : undefined;

  if (owner && repo) {
    const rows = await db
      .select()
      .from(analyticsSiteTable)
      .where(and(eq(analyticsSiteTable.owner, owner), eq(analyticsSiteTable.repo, repo)))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ status: "error", message: `No analytics_site for ${owner}/${repo}` }, { status: 404 });
    }
    const result = await syncSite(rows[0] as never, { backfillDays });
    return NextResponse.json({ status: "ok", result });
  }

  const results = await syncAllSites({ backfillDays });
  return NextResponse.json({ status: "ok", count: results.length, results });
};

export const GET = handler;
export const POST = handler;
