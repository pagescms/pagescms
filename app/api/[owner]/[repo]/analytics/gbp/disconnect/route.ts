import { NextResponse } from "next/server";
import { getRepoAnalyticsContext } from "@/lib/analytics/repo-context";
import { clearGbpConnectionOnSite, deleteRefreshToken } from "@/lib/analytics/gbp";

type Params = { owner: string; repo: string };

export async function POST(
  _request: Request,
  context: { params: Promise<Params> }
): Promise<Response> {
  const { owner, repo } = await context.params;
  try {
    const { site } = await getRepoAnalyticsContext({ owner, repo });
    if (!site) {
      return NextResponse.json({ status: "error", message: "Site not found" }, { status: 404 });
    }
    await deleteRefreshToken(site.id);
    await clearGbpConnectionOnSite(site.id);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status?: number }).status ?? 500
        : 500;
    const message = error instanceof Error ? error.message : "Failed to disconnect GBP";
    return NextResponse.json({ status: "error", message }, { status });
  }
}
