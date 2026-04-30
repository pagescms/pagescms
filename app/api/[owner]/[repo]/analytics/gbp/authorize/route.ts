import { NextResponse } from "next/server";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import { buildAuthState, buildAuthUrl } from "@/lib/analytics/gbp";
import { createHttpError } from "@/lib/api-error";

type Params = { owner: string; repo: string };

export async function GET(
  _request: Request,
  context: { params: Promise<Params> }
): Promise<Response> {
  const { owner, repo } = await context.params;
  try {
    const { user, site } = await getRepoAnalyticsContext({ owner, repo });
    if (!site) {
      throw createHttpError(
        `No analytics site row exists for ${owner}/${repo} — save settings once first.`,
        404
      );
    }

    const state = await buildAuthState({ owner, repo, userId: user.id });
    const url = buildAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status?: number }).status ?? 500
        : 500;
    const message = error instanceof Error ? error.message : "Failed to initiate GBP OAuth";
    return NextResponse.json({ status: "error", message }, { status });
  }
}
