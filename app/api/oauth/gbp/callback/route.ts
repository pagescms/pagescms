import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/base-url";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import {
  verifyAuthState,
  exchangeCodeForTokens,
  storeRefreshToken,
  enumerateAllLocations,
  updateGbpLocationOnSite,
} from "@/lib/analytics/gbp";

const settingsUrl = (owner: string, repo: string, params: Record<string, string>) => {
  const url = new URL(`${getBaseUrl()}/${owner}/${repo}/analytics/settings`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
};

const errorRedirect = (owner: string, repo: string, reason: string) =>
  NextResponse.redirect(settingsUrl(owner, repo, { gbp: "error", reason }));

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (!state) {
    return NextResponse.json(
      { status: "error", message: "Missing state parameter" },
      { status: 400 }
    );
  }

  let payload: Awaited<ReturnType<typeof verifyAuthState>>;
  try {
    payload = await verifyAuthState(state);
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Invalid state",
      },
      { status: 400 }
    );
  }

  const { owner, repo, userId } = payload;

  if (oauthError) {
    return errorRedirect(owner, repo, oauthError);
  }
  if (!code) {
    return errorRedirect(owner, repo, "missing_code");
  }

  try {
    const { user, site } = await getRepoAnalyticsContext({ owner, repo });
    if (user.id !== userId) {
      return errorRedirect(owner, repo, "session_mismatch");
    }
    if (!site) {
      return errorRedirect(owner, repo, "no_site");
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return errorRedirect(owner, repo, "no_refresh_token");
    }

    await storeRefreshToken(site.id, tokens.refresh_token);

    const locations = await enumerateAllLocations(tokens.access_token);

    if (locations.length === 0) {
      return NextResponse.redirect(
        settingsUrl(owner, repo, { gbp: "error", reason: "no_locations" })
      );
    }

    if (locations.length > 1) {
      return NextResponse.redirect(
        settingsUrl(owner, repo, {
          gbp: "error",
          reason: "multiple_locations",
          count: String(locations.length),
        })
      );
    }

    const loc = locations[0];
    await updateGbpLocationOnSite(site.id, loc.accountId, loc.locationId, loc.locationName);

    return NextResponse.redirect(
      settingsUrl(owner, repo, { gbp: "success", location: loc.locationName })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorRedirect(owner, repo, encodeURIComponent(message).slice(0, 200));
  }
}
