import "server-only";

import type { NetlifyFormsMetrics } from "./types";

const NETLIFY_API_BASE = "https://api.netlify.com/api/v1";

const getToken = () => {
  const t = process.env.NETLIFY_PAT;
  if (!t) throw new Error("NETLIFY_PAT is not set.");
  return t;
};

type Submission = {
  id: string;
  form_id: string;
  form_name: string | null;
  created_at: string;
  email?: string | null;
  name?: string | null;
  [key: string]: unknown;
};

const request = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${NETLIFY_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "User-Agent": "pagescms-analytics",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Netlify ${path} failed ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
};

/**
 * List every submission for a site over a date window. Netlify's endpoint has
 * no server-side date filter, so we paginate until we pass the window's lower
 * bound.
 */
export const listSubmissionsInRange = async (
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<Submission[]> => {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T23:59:59Z`);
  const all: Submission[] = [];
  const perPage = 200;
  let page = 1;
  // Hard cap so a misconfigured site can't eat the function budget.
  const maxPages = 50;

  while (page <= maxPages) {
    const batch = await request<Submission[]>(
      `/sites/${encodeURIComponent(siteId)}/submissions?per_page=${perPage}&page=${page}`,
    );
    if (batch.length === 0) break;

    let passedWindow = false;
    for (const s of batch) {
      const t = Date.parse(s.created_at);
      if (!Number.isFinite(t)) continue;
      if (t > endMs) continue;
      if (t < startMs) {
        passedWindow = true;
        continue;
      }
      all.push(s);
    }

    // Netlify returns newest-first; once the batch's oldest precedes the window we're done.
    if (passedWindow || batch.length < perPage) break;
    page += 1;
  }

  return all;
};

export const fetchDailySubmissions = async (
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; metrics: NetlifyFormsMetrics }>> => {
  const subs = await listSubmissionsInRange(siteId, startDate, endDate);
  const byDate = new Map<string, number>();
  for (const s of subs) {
    const date = s.created_at.slice(0, 10);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  return Array.from(byDate.entries())
    .map(([date, submissions]) => ({ date, metrics: { submissions } }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
};

export const fetchPerFormBreakdown = async (
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ value: string; metrics: NetlifyFormsMetrics }>> => {
  const subs = await listSubmissionsInRange(siteId, startDate, endDate);
  const byForm = new Map<string, number>();
  for (const s of subs) {
    const name = s.form_name || "(unnamed)";
    byForm.set(name, (byForm.get(name) ?? 0) + 1);
  }
  return Array.from(byForm.entries())
    .map(([value, submissions]) => ({ value, metrics: { submissions } }))
    .sort((a, b) => b.metrics.submissions - a.metrics.submissions);
};

export const probeConnection = async (
  siteId: string,
): Promise<{ ok: true; name?: string | null } | { ok: false; reason: string }> => {
  try {
    const site = await request<{ id: string; name?: string | null }>(`/sites/${encodeURIComponent(siteId)}`);
    return { ok: true, name: site.name ?? null };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown Netlify error" };
  }
};
