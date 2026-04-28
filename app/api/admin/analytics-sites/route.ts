export const maxDuration = 60;

import { type NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSiteTable } from "@/db/schema";
import * as gsc from "@/lib/analytics/gsc";
import * as bing from "@/lib/analytics/bing";
import * as ga4 from "@/lib/analytics/ga4";
import * as netlifyForms from "@/lib/analytics/netlify-forms";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import type { CallTrackingProvider } from "@/lib/analytics/types";

/**
 * Admin endpoint that creates or updates an analytics_site row programmatically
 * — used by the local-seo-site-builder onboarding CLI so a new client site can
 * be wired up to nightly syncs and the weekly digest without anyone touching
 * the portal settings page by hand.
 *
 * Auth: Bearer ADMIN_API_TOKEN (separate from CRON_SECRET; do not put this
 * route under /api/cron/* because Vercel's bot firewall 403s external POSTs to
 * cron paths).
 *
 * Failure mode: if any provider that the caller asked us to probe fails, we
 * return 422 and persist nothing. The caller fixes the upstream config (GSC
 * grant, GA4 viewer, etc.) and re-runs.
 */

const CALL_TRACKING_VALUES: readonly (CallTrackingProvider | "" | null)[] = [
  "callrail",
  "whatconverts",
  null,
  "",
] as const;

type Body = {
  owner: string;
  repo: string;
  timezone?: string;
  gscProperty?: string | null;
  bingSiteUrl?: string | null;
  ga4PropertyId?: string | null;
  callTrackingProvider?: CallTrackingProvider | "" | null;
  callrailAccountId?: string | null;
  callrailCompanyId?: string | null;
  whatconvertsAccountId?: string | null;
  whatconvertsProfileId?: string | null;
  netlifySiteId?: string | null;
  llmMentionsEnabled?: boolean;
  llmMentionsCompetitors?: string[];
  digestEnabled?: boolean;
  digestRecipients?: string[];
  skipProbes?: boolean;
};

type ProbeResult = { ok: boolean; detail?: string };
type Probes = Partial<Record<"gsc" | "bing" | "ga4" | "netlify_forms", ProbeResult>>;

const isAuthorized = (request: NextRequest) => {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
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

const runProbes = async (input: {
  gscProperty: string | null;
  bingSiteUrl: string | null;
  ga4PropertyId: string | null;
  netlifySiteId: string | null;
}): Promise<Probes> => {
  const probes: Probes = {};

  const tasks: Promise<void>[] = [];

  if (input.gscProperty) {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64) {
      probes.gsc = { ok: false, detail: "GOOGLE_SERVICE_ACCOUNT_JSON_B64 not set in server env." };
    } else {
      tasks.push(
        gsc.probeConnection(input.gscProperty).then((r) => {
          probes.gsc = r.ok ? { ok: true } : { ok: false, detail: r.reason };
        }),
      );
    }
  }

  if (input.bingSiteUrl) {
    if (!process.env.BING_WEBMASTER_API_KEY) {
      probes.bing = { ok: false, detail: "BING_WEBMASTER_API_KEY not set in server env." };
    } else {
      tasks.push(
        bing.probeConnection(input.bingSiteUrl).then((r) => {
          probes.bing = r.ok ? { ok: true } : { ok: false, detail: r.reason };
        }),
      );
    }
  }

  if (input.ga4PropertyId) {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64) {
      probes.ga4 = { ok: false, detail: "GOOGLE_SERVICE_ACCOUNT_JSON_B64 not set in server env." };
    } else {
      tasks.push(
        ga4.probeConnection(input.ga4PropertyId).then((r) => {
          probes.ga4 = r.ok
            ? { ok: true, detail: typeof r.sessions === "number" ? `${r.sessions} sessions in last 7 days` : undefined }
            : { ok: false, detail: r.reason };
        }),
      );
    }
  }

  if (input.netlifySiteId) {
    if (!process.env.NETLIFY_PAT) {
      probes.netlify_forms = { ok: false, detail: "NETLIFY_PAT not set in server env." };
    } else {
      tasks.push(
        netlifyForms.probeConnection(input.netlifySiteId).then((r) => {
          probes.netlify_forms = r.ok
            ? { ok: true, detail: r.name ? `Netlify site: ${r.name}` : undefined }
            : { ok: false, detail: r.reason };
        }),
      );
    }
  }

  await Promise.all(tasks);
  return probes;
};

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body) throw createHttpError("Invalid JSON body.", 400);

    const owner = body.owner?.trim();
    const repo = body.repo?.trim();
    if (!owner || !repo) throw createHttpError("owner and repo are required.", 400);

    if (body.callTrackingProvider !== undefined && !CALL_TRACKING_VALUES.includes(body.callTrackingProvider)) {
      throw createHttpError("Invalid callTrackingProvider.", 400);
    }

    const callProvider =
      body.callTrackingProvider === "" || body.callTrackingProvider === null || body.callTrackingProvider === undefined
        ? null
        : body.callTrackingProvider;

    const gscProperty = body.gscProperty?.trim() || null;
    const bingSiteUrl = normalizeUrl(body.bingSiteUrl);
    const ga4PropertyId = normalizeGa4PropertyId(body.ga4PropertyId);
    const netlifySiteId = body.netlifySiteId?.trim() || null;

    const probes = body.skipProbes
      ? {}
      : await runProbes({ gscProperty, bingSiteUrl, ga4PropertyId, netlifySiteId });

    const allProbesOk = Object.values(probes).every((p) => p.ok);
    if (!allProbesOk) {
      return NextResponse.json(
        { status: "error", message: "One or more provider probes failed; nothing persisted.", probes },
        { status: 422 },
      );
    }

    const patch = {
      timezone: body.timezone?.trim() || undefined,
      gscProperty,
      bingSiteUrl,
      ga4PropertyId,
      callTrackingProvider: callProvider,
      callrailAccountId: body.callrailAccountId ?? null,
      callrailCompanyId: body.callrailCompanyId ?? null,
      whatconvertsAccountId: body.whatconvertsAccountId ?? null,
      whatconvertsProfileId: body.whatconvertsProfileId ?? null,
      netlifySiteId,
      llmMentionsEnabled: body.llmMentionsEnabled ?? false,
      llmMentionsCompetitors: body.llmMentionsCompetitors ?? [],
      digestEnabled: body.digestEnabled ?? true,
      digestRecipients: body.digestRecipients ?? [],
      updatedAt: new Date(),
    };

    const existing = await db
      .select({ id: analyticsSiteTable.id })
      .from(analyticsSiteTable)
      .where(and(eq(analyticsSiteTable.owner, owner), eq(analyticsSiteTable.repo, repo)))
      .limit(1);

    let siteId: number;
    let created: boolean;
    if (existing.length === 0) {
      const inserted = await db
        .insert(analyticsSiteTable)
        .values({ owner, repo, ...patch })
        .returning({ id: analyticsSiteTable.id });
      siteId = inserted[0].id;
      created = true;
    } else {
      siteId = existing[0].id;
      created = false;
      await db.update(analyticsSiteTable).set(patch).where(eq(analyticsSiteTable.id, siteId));
    }

    const [site] = await db
      .select()
      .from(analyticsSiteTable)
      .where(eq(analyticsSiteTable.id, siteId))
      .limit(1);

    return NextResponse.json({ status: "ok", created, site, probes });
  } catch (error) {
    return toErrorResponse(error);
  }
}
