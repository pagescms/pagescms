"use client";

import type { ActivityRow } from "@/lib/analytics/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const KIND_ICON: Record<string, string> = {
  blog_published: "📝",
  content_updated: "✏️",
  deploy: "🚀",
  backlink_gained: "🔗",
  schema_added: "🏷️",
  citation_built: "⭐",
  gbp_post: "📍",
  photo_added: "📷",
  review_response: "💬",
  manual: "✨",
};

const SOURCE_LABEL: Record<string, string> = {
  github: "via GitHub",
  netlify: "via Netlify",
  dataforseo: "via DataForSEO",
  agency: "added by agency",
};

const groupByBucket = (entries: ActivityRow[]): Array<{ bucket: string; rows: ActivityRow[] }> => {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const buckets = new Map<string, ActivityRow[]>();
  for (const e of entries) {
    let bucket = "Older";
    if (e.date >= today) bucket = "Today";
    else if (e.date >= yesterday) bucket = "Yesterday";
    else if (e.date >= weekAgo) bucket = "Earlier this week";
    else if (e.date >= monthAgo) bucket = "Earlier this month";
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(e);
  }
  const order = ["Today", "Yesterday", "Earlier this week", "Earlier this month", "Older"];
  return order
    .filter((b) => buckets.has(b))
    .map((bucket) => ({ bucket, rows: buckets.get(bucket)! }));
};

export function ActivityFeed({ entries }: { entries: ActivityRow[] }) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center text-center text-muted-foreground text-sm px-4">
            No activity recorded yet. The feed populates from your site&apos;s GitHub commits, Netlify deploys, and the
            work the agency logs.
          </div>
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByBucket(entries);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          A chronological log of the work being done on this site — content updates, deploys, and agency work.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {grouped.map(({ bucket, rows }) => (
          <div key={bucket}>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">{bucket}</h3>
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <span className="text-lg leading-tight" aria-hidden>
                    {KIND_ICON[r.kind] ?? "•"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{r.title}</div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                      <span>{r.date}</span>
                      <span aria-hidden>·</span>
                      <span>{SOURCE_LABEL[r.source] ?? r.source}</span>
                      {r.url && (
                        <>
                          <span aria-hidden>·</span>
                          <a className="hover:underline text-foreground" href={r.url} target="_blank" rel="noopener noreferrer">
                            View →
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
