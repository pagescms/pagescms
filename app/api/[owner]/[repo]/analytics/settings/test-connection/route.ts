export const maxDuration = 30;

import { type NextRequest, NextResponse } from "next/server";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import * as gsc from "@/lib/analytics/gsc";
import * as bing from "@/lib/analytics/bing";
import * as ga4 from "@/lib/analytics/ga4";
import * as netlifyForms from "@/lib/analytics/netlify-forms";
import * as llmMentions from "@/lib/analytics/llm-mentions";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import type { AnalyticsProvider } from "@/lib/analytics/types";

type TestConnectionBody = {
  provider: AnalyticsProvider;
};

type Env = {
  hasGoogleServiceAccount: boolean;
  hasBingApiKey: boolean;
  hasCallRailKey: boolean;
  hasWhatConvertsAuth: boolean;
  hasNetlifyPat: boolean;
  hasDataForSeoAuth: boolean;
};

const readEnv = (): Env => ({
  hasGoogleServiceAccount: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64),
  hasBingApiKey: Boolean(process.env.BING_WEBMASTER_API_KEY),
  hasCallRailKey: Boolean(process.env.CALLRAIL_API_KEY),
  hasWhatConvertsAuth: Boolean(process.env.WHATCONVERTS_API_TOKEN) && Boolean(process.env.WHATCONVERTS_API_SECRET),
  hasNetlifyPat: Boolean(process.env.NETLIFY_PAT),
  hasDataForSeoAuth: Boolean(process.env.DATAFORSEO_USERNAME) && Boolean(process.env.DATAFORSEO_PASSWORD),
});

/**
 * v1 shell: checks that (a) the agency credential for the provider is set in
 * env and (b) the per-site identifier is present on analytics_site. Real API
 * probes land in PR 2/3 when the provider clients exist in lib/analytics/*.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const params = await context.params;
    const { site } = await getRepoAnalyticsContext(params);

    const body = (await request.json().catch(() => null)) as TestConnectionBody | null;
    if (!body?.provider) throw createHttpError("Missing provider in body.", 400);

    const env = readEnv();
    const checks: Array<{ label: string; ok: boolean; detail?: string }> = [];

    switch (body.provider) {
      case "gsc": {
        checks.push({ label: "GOOGLE_SERVICE_ACCOUNT_JSON_B64 set", ok: env.hasGoogleServiceAccount });
        checks.push({ label: "gscProperty configured", ok: Boolean(site?.gscProperty), detail: site?.gscProperty ?? undefined });
        if (env.hasGoogleServiceAccount && site?.gscProperty) {
          const probe = await gsc.probeConnection(site.gscProperty);
          checks.push({
            label: probe.ok ? "GSC API responds for this property" : `GSC API: ${probe.reason}`,
            ok: probe.ok,
          });
        }
        break;
      }
      case "bing": {
        checks.push({ label: "BING_WEBMASTER_API_KEY set", ok: env.hasBingApiKey });
        checks.push({ label: "bingSiteUrl configured", ok: Boolean(site?.bingSiteUrl), detail: site?.bingSiteUrl ?? undefined });
        if (env.hasBingApiKey && site?.bingSiteUrl) {
          const probe = await bing.probeConnection(site.bingSiteUrl);
          checks.push({
            label: probe.ok ? "Bing API responds and site is verified" : `Bing API: ${probe.reason}`,
            ok: probe.ok,
          });
        }
        break;
      }
      case "ga4": {
        checks.push({ label: "GOOGLE_SERVICE_ACCOUNT_JSON_B64 set", ok: env.hasGoogleServiceAccount });
        checks.push({ label: "ga4PropertyId configured", ok: Boolean(site?.ga4PropertyId), detail: site?.ga4PropertyId ?? undefined });
        if (env.hasGoogleServiceAccount && site?.ga4PropertyId) {
          const probe = await ga4.probeConnection(site.ga4PropertyId);
          checks.push({
            label: probe.ok
              ? `GA4 API responds (${probe.sessions ?? 0} sessions last 7 days)`
              : `GA4 API: ${probe.reason}`,
            ok: probe.ok,
          });
        }
        break;
      }
      case "callrail":
        checks.push({ label: "CALLRAIL_API_KEY set", ok: env.hasCallRailKey });
        checks.push({ label: "callrailAccountId configured", ok: Boolean(site?.callrailAccountId), detail: site?.callrailAccountId ?? undefined });
        break;
      case "whatconverts":
        checks.push({ label: "WHATCONVERTS_API_TOKEN + SECRET set", ok: env.hasWhatConvertsAuth });
        checks.push({ label: "whatconvertsProfileId configured", ok: Boolean(site?.whatconvertsProfileId), detail: site?.whatconvertsProfileId ?? undefined });
        break;
      case "netlify_forms": {
        checks.push({ label: "NETLIFY_PAT set", ok: env.hasNetlifyPat });
        checks.push({ label: "netlifySiteId configured", ok: Boolean(site?.netlifySiteId), detail: site?.netlifySiteId ?? undefined });
        if (env.hasNetlifyPat && site?.netlifySiteId) {
          const probe = await netlifyForms.probeConnection(site.netlifySiteId);
          checks.push({
            label: probe.ok
              ? `Netlify API responds${probe.name ? ` (site: ${probe.name})` : ""}`
              : `Netlify API: ${probe.reason}`,
            ok: probe.ok,
          });
        }
        break;
      }
      case "llm_mentions": {
        checks.push({ label: "DATAFORSEO_USERNAME + DATAFORSEO_PASSWORD set", ok: env.hasDataForSeoAuth });
        const domain = site?.gscProperty
          ? site.gscProperty.startsWith("sc-domain:")
            ? site.gscProperty.slice("sc-domain:".length)
            : (() => {
                try {
                  return new URL(site.gscProperty).hostname.replace(/^www\./, "");
                } catch {
                  return "";
                }
              })()
          : "";
        checks.push({ label: "primary domain derivable from gscProperty", ok: Boolean(domain), detail: domain || undefined });
        checks.push({ label: "llmMentionsEnabled is true", ok: Boolean(site?.llmMentionsEnabled) });
        if (env.hasDataForSeoAuth && domain) {
          const probe = await llmMentions.probeConnection(domain);
          checks.push({
            label: probe.ok
              ? `DataForSEO responds (Google AIO: ${probe.googleMentions ?? 0}, ChatGPT: ${probe.chatGptMentions ?? 0} mentions)`
              : `DataForSEO: ${probe.reason}`,
            ok: probe.ok,
          });
        }
        break;
      }
      default:
        throw createHttpError(`Unknown provider: ${body.provider}`, 400);
    }

    const ok = checks.every((c) => c.ok);
    return NextResponse.json({ status: ok ? "ok" : "error", provider: body.provider, checks });
  } catch (error) {
    return toErrorResponse(error);
  }
}
