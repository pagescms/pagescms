import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsActivityTable } from "@/db/schema";
import { getInstallationToken } from "@/lib/token";
import type { ActivityKind, ActivityRow, ActivitySource } from "./types";

/**
 * Activity feed ingestion. Two auto sources for v1:
 *
 *   1. GitHub commits — classify by touched paths into blog / services /
 *      service-areas / business-info entries. Backfill 30 days; idempotent
 *      via dedup on (siteId, source='github', externalId=commitSha).
 *
 *   2. Netlify production deploys — one entry per ready deploy. Dedup via
 *      (siteId, source='netlify', externalId=deployId).
 *
 * Both run on the daily sync alongside GSC/Bing/GA4 etc. The dedup unique
 * index makes re-runs safe.
 */

type ActivityInsert = {
  date: string;
  kind: ActivityKind;
  title: string;
  description?: string | null;
  url?: string | null;
  source: ActivitySource;
  metadata?: Record<string, unknown>;
  externalId?: string | null;
};

const upsertActivity = async (siteId: number, rows: ActivityInsert[]): Promise<number> => {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(analyticsActivityTable)
    .values(
      rows.map((r) => ({
        siteId,
        date: r.date,
        kind: r.kind,
        title: r.title,
        description: r.description ?? null,
        url: r.url ?? null,
        source: r.source,
        metadata: r.metadata ?? {},
        externalId: r.externalId ?? null,
      })),
    )
    .onConflictDoNothing({
      target: [analyticsActivityTable.siteId, analyticsActivityTable.source, analyticsActivityTable.externalId],
    })
    .returning({ id: analyticsActivityTable.id });
  return inserted.length;
};

/* ─── GitHub commits ───────────────────────────────────────────────────── */

type GithubCommitListItem = {
  sha: string;
  commit: {
    author: { date: string; email?: string; name?: string };
    message: string;
  };
  author: { login?: string; type?: string } | null;
  html_url: string;
};

type GithubCommitDetail = GithubCommitListItem & {
  files?: Array<{ filename: string; status: string }>;
};

const githubFetch = async <T>(token: string, path: string): Promise<T> => {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!r.ok) {
    throw new Error(`GitHub ${path} HTTP ${r.status}: ${await r.text().then((t) => t.slice(0, 200))}`);
  }
  return (await r.json()) as T;
};

const isBotCommit = (commit: GithubCommitListItem): boolean => {
  const email = commit.commit.author.email ?? "";
  const login = commit.author?.login ?? "";
  return /\[bot\]$/.test(login) || email.endsWith("noreply@github.com") || email === "actions@github.com";
};

type Classification = { kind: ActivityKind; title: string; section: string };

/**
 * Classify a commit by its touched files. First-match-wins (blog beats services
 * beats locations beats site-info). Returns null if nothing matches (config /
 * dependency / template-only commits get skipped).
 */
export const classifyCommit = (filenames: string[]): Classification | null => {
  const lower = filenames.map((f) => f.toLowerCase());

  // Blog COMMITS are content updates ("blog post edited: X"). The actual
  // "blog_published" event lands via syncScheduledBlogPosts on the post's
  // frontmatter date — most posts are committed weeks ahead of publish via
  // the scheduled-build cron, so commit date != publish date.
  const blogPath = filenames.find((f) => /(^|\/)src\/blog\//i.test(f));
  if (blogPath || lower.some((p) => p.endsWith("_data/blog.json"))) {
    const slug = blogPath ? blogPath.split("/").pop()?.replace(/\.(md|njk|html)$/i, "") : "";
    const titleSuffix = slug ? `: ${slug.replace(/-/g, " ")}` : "";
    return { kind: "content_updated", title: `Blog post edited${titleSuffix}`, section: "blog" };
  }
  if (lower.some((p) => /(^|\/)src\/services\//.test(p) || /(^|\/)_data\/(services|servicelist)/.test(p))) {
    return { kind: "content_updated", title: "Updated services page", section: "services" };
  }
  if (lower.some((p) => /(^|\/)src\/service-areas\//.test(p) || /(^|\/)_data\/(locations|locationlist)/.test(p))) {
    return { kind: "content_updated", title: "Updated service area pages", section: "service_areas" };
  }
  if (lower.some((p) => p.endsWith("_data/site.json"))) {
    return { kind: "content_updated", title: "Updated business info", section: "site_info" };
  }
  return null;
};

export const syncGithubCommits = async (
  siteId: number,
  owner: string,
  repo: string,
  sinceDate: string,
): Promise<number> => {
  const token = await getInstallationToken(owner, repo);
  if (!token) return 0;

  const list = await githubFetch<GithubCommitListItem[]>(
    token,
    `/repos/${owner}/${repo}/commits?since=${encodeURIComponent(sinceDate)}&per_page=100`,
  );

  // Pull file lists in parallel, classify, then upsert.
  const details = await Promise.all(
    list
      .filter((c) => !isBotCommit(c))
      .map(async (c) => {
        try {
          const detail = await githubFetch<GithubCommitDetail>(token, `/repos/${owner}/${repo}/commits/${c.sha}`);
          return detail;
        } catch {
          return null;
        }
      }),
  );

  const rows: ActivityInsert[] = [];
  for (const d of details) {
    if (!d) continue;
    const filenames = (d.files ?? []).map((f) => f.filename);
    const cls = classifyCommit(filenames);
    if (!cls) continue;
    rows.push({
      date: d.commit.author.date.slice(0, 10),
      kind: cls.kind,
      title: cls.title,
      description: null,
      url: d.html_url,
      source: "github",
      metadata: {
        section: cls.section,
        commitSha: d.sha,
        filesChanged: filenames.length,
        // Raw commit message kept for agency-side debugging only — UI never surfaces this directly.
        rawMessage: d.commit.message.slice(0, 500),
      },
      externalId: d.sha,
    });
  }

  return await upsertActivity(siteId, rows);
};

/* ─── Scheduled blog posts (Eleventy frontmatter `date` based) ─────────── */
//
// Local-services sites use future-dated blog posts: a post is committed weeks
// ahead with `date: 2026-04-27T08:00:00-05:00`, and a Monday-cron rebuild
// publishes it on that date. There's no commit on the publication day, so the
// commit-based path misses the publish event entirely. This function fills
// that gap by reading every blog file's frontmatter `date` and creating a
// `blog_published` entry on the actual publish day.
//
// Idempotent via externalId = `blog:<slug>`. Re-runs are safe.

type GithubContentItem = {
  type: "file" | "dir" | "submodule" | "symlink";
  name: string;
  path: string;
  html_url: string;
};

type GithubContentFile = GithubContentItem & {
  content: string;
  encoding: "base64";
};

const parseFrontmatterField = (content: string, field: string): string | null => {
  const re = new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, "m");
  return content.match(re)?.[1] ?? null;
};

export const syncScheduledBlogPosts = async (
  siteId: number,
  owner: string,
  repo: string,
  windowDays = 30,
): Promise<number> => {
  const token = await getInstallationToken(owner, repo);
  if (!token) return 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const cutoffIso = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);

  let items: GithubContentItem[];
  try {
    items = await githubFetch<GithubContentItem[]>(token, `/repos/${owner}/${repo}/contents/src/blog`);
  } catch {
    // No src/blog dir — silently skip
    return 0;
  }

  const rows: ActivityInsert[] = [];
  for (const item of items) {
    if (item.type !== "file" || !/\.(md|njk)$/.test(item.name)) continue;
    let file: GithubContentFile;
    try {
      file = await githubFetch<GithubContentFile>(token, `/repos/${owner}/${repo}/contents/${item.path}`);
    } catch {
      continue;
    }
    const content = Buffer.from(file.content, "base64").toString("utf8");
    const dateRaw = parseFrontmatterField(content, "date");
    const titleRaw = parseFrontmatterField(content, "title");
    if (!dateRaw) continue;
    const postDate = dateRaw.slice(0, 10);
    // Only insert published-and-recent posts. Future posts still hidden.
    if (postDate > todayIso || postDate < cutoffIso) continue;
    const slug = item.name.replace(/\.(md|njk)$/, "");
    const title = titleRaw ?? slug.replace(/-/g, " ");
    rows.push({
      date: postDate,
      kind: "blog_published",
      title: `Published article: ${title}`,
      description: null,
      url: file.html_url,
      source: "github",
      metadata: { slug, frontmatterDate: dateRaw },
      externalId: `blog:${slug}`,
    });
  }

  return await upsertActivity(siteId, rows);
};

/* ─── Netlify deploys ──────────────────────────────────────────────────── */

type NetlifyDeploy = {
  id: string;
  state: string;
  context: string;
  title: string | null;
  commit_ref: string | null;
  commit_url: string | null;
  deploy_ssl_url: string | null;
  deploy_time: number | null;
  created_at: string;
};

export const syncNetlifyDeploys = async (siteId: number, netlifySiteId: string): Promise<number> => {
  const pat = process.env.NETLIFY_PAT;
  if (!pat) throw new Error("NETLIFY_PAT not set in env.");

  const r = await fetch(
    `https://api.netlify.com/api/v1/sites/${netlifySiteId}/deploys?per_page=30&production=true`,
    { headers: { Authorization: `Bearer ${pat}` } },
  );
  if (!r.ok) throw new Error(`Netlify HTTP ${r.status}: ${await r.text().then((t) => t.slice(0, 200))}`);
  const deploys = (await r.json()) as NetlifyDeploy[];

  const rows: ActivityInsert[] = deploys
    .filter((d) => d.state === "ready" && d.context === "production")
    .map((d) => ({
      date: d.created_at.slice(0, 10),
      kind: "deploy" as ActivityKind,
      title: "Site rebuilt and deployed",
      description: d.title || null,
      url: d.deploy_ssl_url || d.commit_url || null,
      source: "netlify" as ActivitySource,
      metadata: {
        deployId: d.id,
        commitSha: d.commit_ref,
        buildSeconds: d.deploy_time,
      },
      externalId: d.id,
    }));

  return await upsertActivity(siteId, rows);
};

/* ─── Read helpers ─────────────────────────────────────────────────────── */

export const getActivityFeed = async (
  siteId: number,
  days: number,
): Promise<ActivityRow[]> => {
  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
  const since = sinceDate.toISOString().slice(0, 10);

  const rows = await db.execute(sql`
    select id, site_id as "siteId", date, kind, title, description, url, source, metadata, external_id as "externalId", created_at as "createdAt"
    from analytics_activity
    where site_id = ${siteId} and date >= ${since}
    order by date desc, id desc
    limit 500
  `);
  return rows as unknown as ActivityRow[];
};
