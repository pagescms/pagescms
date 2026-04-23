export const maxDuration = 30;

import { type NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSiteTable } from "@/db/schema";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import type { CallTrackingProvider } from "@/lib/analytics/types";

const CALL_TRACKING_VALUES: readonly (CallTrackingProvider | "")[] = [
  "callrail",
  "whatconverts",
  null,
  "",
] as const;

type SettingsPatch = {
  timezone?: string;
  gscProperty?: string | null;
  bingSiteUrl?: string | null;
  ga4PropertyId?: string | null;
  callTrackingProvider?: CallTrackingProvider | "";
  callrailAccountId?: string | null;
  callrailCompanyId?: string | null;
  whatconvertsAccountId?: string | null;
  whatconvertsProfileId?: string | null;
  netlifySiteId?: string | null;
  digestEnabled?: boolean;
  digestRecipients?: string[];
};

const normalizeGa4PropertyId = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("properties/") ? trimmed : `properties/${trimmed.replace(/^properties\//, "")}`;
};

const normalizeUrl = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
  return trimmed;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const params = await context.params;
    const { site } = await getRepoAnalyticsContext(params);
    return NextResponse.json({ status: "ok", site });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const params = await context.params;
    const { owner, repo } = params;
    await getRepoAnalyticsContext(params);

    const body = (await request.json().catch(() => null)) as SettingsPatch | null;
    if (!body) throw createHttpError("Invalid JSON body.", 400);

    if (body.callTrackingProvider !== undefined && !CALL_TRACKING_VALUES.includes(body.callTrackingProvider)) {
      throw createHttpError("Invalid callTrackingProvider.", 400);
    }

    const callProvider =
      body.callTrackingProvider === "" || body.callTrackingProvider === null
        ? null
        : body.callTrackingProvider;

    const patch = {
      timezone: body.timezone?.trim() || undefined,
      gscProperty: body.gscProperty ?? undefined,
      bingSiteUrl: normalizeUrl(body.bingSiteUrl) ?? (body.bingSiteUrl === null ? null : undefined),
      ga4PropertyId: normalizeGa4PropertyId(body.ga4PropertyId) ?? (body.ga4PropertyId === null ? null : undefined),
      callTrackingProvider: body.callTrackingProvider === undefined ? undefined : callProvider,
      callrailAccountId: body.callrailAccountId ?? undefined,
      callrailCompanyId: body.callrailCompanyId ?? undefined,
      whatconvertsAccountId: body.whatconvertsAccountId ?? undefined,
      whatconvertsProfileId: body.whatconvertsProfileId ?? undefined,
      netlifySiteId: body.netlifySiteId ?? undefined,
      digestEnabled: body.digestEnabled ?? undefined,
      digestRecipients: body.digestRecipients ?? undefined,
      updatedAt: new Date(),
    };

    const existing = await db
      .select({ id: analyticsSiteTable.id })
      .from(analyticsSiteTable)
      .where(and(eq(analyticsSiteTable.owner, owner), eq(analyticsSiteTable.repo, repo)))
      .limit(1);

    let siteId: number;
    if (existing.length === 0) {
      const inserted = await db
        .insert(analyticsSiteTable)
        .values({
          owner,
          repo,
          ...patch,
        })
        .returning({ id: analyticsSiteTable.id });
      siteId = inserted[0].id;
    } else {
      siteId = existing[0].id;
      await db
        .update(analyticsSiteTable)
        .set(patch)
        .where(eq(analyticsSiteTable.id, siteId));
    }

    const [site] = await db
      .select()
      .from(analyticsSiteTable)
      .where(eq(analyticsSiteTable.id, siteId))
      .limit(1);

    return NextResponse.json({ status: "ok", site });
  } catch (error) {
    return toErrorResponse(error);
  }
}
