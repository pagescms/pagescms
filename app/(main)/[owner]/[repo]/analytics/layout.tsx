import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getConfig } from "@/lib/config-store";
import { ConfigProvider } from "@/contexts/config-context";
import { RepoLayout } from "@/components/repo/repo-layout";
import { getRepoSnapshot } from "@/lib/github-cache-file";
import { getServerSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";

/**
 * Analytics isn't branch-scoped, but the rest of the CMS chrome (sidebar,
 * repo nav) is rendered by the branch-level layout via RepoLayout +
 * ConfigProvider. We replicate that here using the repo's default branch so
 * users on /analytics keep the same navigation they had on /configuration
 * instead of landing on a bare page.
 */
export default async function AnalyticsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const requestHeaders = await headers();
  const session = await getServerSession();
  const user = session?.user;
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!user) return redirect(signInUrl);

  const { token } = await getToken(user, owner, repo);
  if (!token) return redirect(signInUrl);

  const repoInfo = await getRepoSnapshot(owner, repo, token);
  const defaultBranch =
    (repoInfo as { defaultBranch?: string }).defaultBranch ??
    repoInfo.branches?.[0] ??
    "main";

  let config = {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    branch: defaultBranch,
    sha: "",
    version: "",
    object: {},
  };

  try {
    const syncedConfig = await getConfig(owner, repo, defaultBranch, {
      getToken: async () => token,
    });
    if (syncedConfig) config = syncedConfig;
  } catch {
    // fall through with stub config — sidebar still renders with defaults
  }

  return (
    <ConfigProvider value={config}>
      <RepoLayout>{children}</RepoLayout>
    </ConfigProvider>
  );
}
