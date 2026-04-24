export const maxDuration = 300;

import { type NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSiteTable } from "@/db/schema";
import { renderDigestHtml, sendAllDigests, sendDigestForSite } from "@/lib/analytics/digest";

const isAuthorized = (request: NextRequest) => {
  const fromVercelCron = request.headers.get("user-agent")?.includes("vercel-cron");
  if (fromVercelCron) return true;
  const header = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
};

const handler = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const preview = searchParams.get("preview") === "true";

  // Preview mode (GET ?preview=true&owner=X&repo=Y) renders HTML inline for a
  // quick browser check. Still requires auth so public requests can't probe data.
  if (preview) {
    if (!isAuthorized(request)) {
      return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    }
    if (!owner || !repo) {
      return NextResponse.json({ status: "error", message: "preview requires owner + repo" }, { status: 400 });
    }
    const rendered = await renderDigestHtml(owner, repo);
    if (!rendered.ok) {
      return NextResponse.json({ status: "error", message: rendered.reason }, { status: 404 });
    }
    return new Response(rendered.html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  if (owner && repo) {
    const rows = await db
      .select()
      .from(analyticsSiteTable)
      .where(and(eq(analyticsSiteTable.owner, owner), eq(analyticsSiteTable.repo, repo)))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ status: "error", message: `No analytics_site for ${owner}/${repo}` }, { status: 404 });
    }
    const result = await sendDigestForSite(rows[0]);
    return NextResponse.json({ status: "ok", result });
  }

  const results = await sendAllDigests();
  return NextResponse.json({ status: "ok", count: results.length, results });
};

export const GET = handler;
export const POST = handler;
