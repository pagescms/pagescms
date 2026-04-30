import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSiteTable } from "@/db/schema";
import { loadRefreshToken, refreshAccessToken } from "@/lib/analytics/gbp";

const requireInternalKey = (): string => {
  const key = process.env.PAPERCLIP_INTERNAL_API_KEY;
  if (!key) throw new Error("PAPERCLIP_INTERNAL_API_KEY is not set");
  return key;
};

const verifyBearer = (request: Request): boolean => {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${requireInternalKey()}`;
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < header.length; i++) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
};

export async function GET(request: Request): Promise<Response> {
  if (!verifyBearer(request)) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const owner = url.searchParams.get("owner");
  const repo = url.searchParams.get("repo");
  if (!owner || !repo) {
    return NextResponse.json(
      { status: "error", message: "owner and repo query params required" },
      { status: 400 }
    );
  }

  try {
    const rows = await db
      .select()
      .from(analyticsSiteTable)
      .where(and(eq(analyticsSiteTable.owner, owner), eq(analyticsSiteTable.repo, repo)))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json(
        { status: "error", message: `Site not found for ${owner}/${repo}` },
        { status: 404 }
      );
    }
    const site = rows[0];
    if (!site.gbpAccountId || !site.gbpLocationId) {
      return NextResponse.json(
        { status: "error", message: "Site has no GBP location bound" },
        { status: 409 }
      );
    }

    const refreshToken = await loadRefreshToken(site.id);
    if (!refreshToken) {
      return NextResponse.json(
        { status: "error", message: "Site has no GBP refresh token" },
        { status: 409 }
      );
    }

    const tokens = await refreshAccessToken(refreshToken);

    return NextResponse.json({
      status: "ok",
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type,
      accountId: site.gbpAccountId,
      locationId: site.gbpLocationId,
      locationName: site.gbpLocationName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
