import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { AnalyticsDashboard } from "@/components/analytics/dashboard";
import { loadAnalyticsSite } from "@/lib/analytics/repo-context";

export default async function AnalyticsPage(props: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await props.params;
  const site = await loadAnalyticsSite(owner, repo);

  if (!site) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Analytics not configured</EmptyTitle>
          <EmptyDescription>
            Connect Google Search Console, Bing, GA4, call tracking, and Netlify Forms to see
            day-over-day performance for this site.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            className={buttonVariants({ variant: "default" })}
            href={`/${owner}/${repo}/analytics/settings`}
          >
            Configure providers
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return <AnalyticsDashboard owner={owner} repo={repo} />;
}
