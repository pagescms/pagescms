import "server-only";

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSiteTable } from "@/db/schema";
import { createHttpError } from "@/lib/api-error";
import { getGithubId } from "@/lib/github-account";
import { checkRepoAccess } from "@/lib/github-cache-permissions";
import { requireApiUserSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import type { User } from "@/types/user";
import type { AnalyticsSiteRow } from "./types";

type RepoRef = { owner: string; repo: string };

type AnalyticsReadContext = {
  user: User;
  token: string;
  site: AnalyticsSiteRow | null;
};

const loadAnalyticsSite = async (owner: string, repo: string): Promise<AnalyticsSiteRow | null> => {
  const rows = await db
    .select()
    .from(analyticsSiteTable)
    .where(and(eq(analyticsSiteTable.owner, owner), eq(analyticsSiteTable.repo, repo)))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0] as AnalyticsSiteRow;
};

const getRepoAnalyticsContext = async ({ owner, repo }: RepoRef): Promise<AnalyticsReadContext> => {
  const sessionResult = await requireApiUserSession();
  if ("response" in sessionResult) {
    throw createHttpError("Not signed in.", sessionResult.response?.status ?? 401);
  }

  const user = sessionResult.user as User;
  const { token, source } = await getToken(user, owner, repo);
  if (!token) throw createHttpError("Token not found", 401);

  const githubId = await getGithubId(user.id);
  if (githubId && source === "user") {
    const hasAccess = await checkRepoAccess(token, owner, repo, githubId);
    if (!hasAccess) throw createHttpError(`No access to repository ${owner}/${repo}.`, 403);
  }

  const site = await loadAnalyticsSite(owner, repo);
  return { user, token, site };
};

export { getRepoAnalyticsContext, loadAnalyticsSite };
