import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <Link
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href={`/${owner}/${repo}/analytics/settings`}
        >
          Settings
        </Link>
      </div>
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Dashboard tabs (Overview / Search / Traffic / Leads) land in PR 4–5.
        Providers configured: {[
          site.gscProperty && "GSC",
          site.bingSiteUrl && "Bing",
          site.ga4PropertyId && "GA4",
          site.callTrackingProvider === "callrail" && site.callrailCompanyId && "CallRail",
          site.callTrackingProvider === "whatconverts" && site.whatconvertsProfileId && "WhatConverts",
          site.netlifySiteId && "Netlify Forms",
        ].filter(Boolean).join(", ") || "none yet"}.
      </div>
    </div>
  );
}
