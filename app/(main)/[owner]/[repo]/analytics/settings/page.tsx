import { loadAnalyticsSite } from "@/lib/analytics/repo-context";
import { AnalyticsSettingsForm } from "@/components/analytics/settings-form";
import type { AnalyticsSiteRow } from "@/lib/analytics/types";

export default async function AnalyticsSettingsPage(props: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await props.params;
  const site = (await loadAnalyticsSite(owner, repo)) as AnalyticsSiteRow | null;

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Analytics settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-site identifiers for each data provider. Secrets are held in the deployment
          environment — only identifiers are stored here.
        </p>
      </div>
      <AnalyticsSettingsForm owner={owner} repo={repo} initialSite={site} />
    </div>
  );
}
