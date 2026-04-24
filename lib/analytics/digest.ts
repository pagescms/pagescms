import "server-only";

import { and, eq } from "drizzle-orm";
import { render } from "@react-email/render";
import { db } from "@/db";
import { analyticsSiteTable } from "@/db/schema";
import { sendEmail } from "@/lib/mailer";
import { getBaseUrl } from "@/lib/base-url";
import { brand } from "@/lib/brand";
import { WeeklyDigestEmailTemplate } from "@/components/email/weekly-digest";
import { getDigestData } from "./digest-query";

type AnalyticsSiteRecord = typeof analyticsSiteTable.$inferSelect;

export type DigestSendResult =
  | { ok: true; owner: string; repo: string; recipientCount: number }
  | { ok: false; owner: string; repo: string; reason: string };

const friendlyName = (repo: string) =>
  repo
    .replace(/[-_]site$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

type RenderedDigest = {
  subject: string;
  html: string;
  recipients: string[];
};

const renderDigest = async (site: AnalyticsSiteRecord): Promise<RenderedDigest | null> => {
  const recipients = Array.isArray(site.digestRecipients)
    ? (site.digestRecipients as string[]).filter((s) => typeof s === "string" && s.includes("@"))
    : [];
  if (recipients.length === 0) return null;

  const data = await getDigestData(site.id);
  const siteName = friendlyName(site.repo);
  const ownerRepo = `${site.owner}/${site.repo}`;
  const dashboardUrl = `${getBaseUrl()}/${site.owner}/${site.repo}/analytics`;

  const html = await render(
    WeeklyDigestEmailTemplate({ siteName, ownerRepo, data, dashboardUrl }),
  );
  const subject = `${siteName} weekly report · ${data.window.currentStart} → ${data.window.currentEnd}`;
  return { subject, html, recipients };
};

export const renderDigestHtml = async (
  owner: string,
  repo: string,
): Promise<{ ok: true; html: string; subject: string; recipients: string[] } | { ok: false; reason: string }> => {
  const rows = await db
    .select()
    .from(analyticsSiteTable)
    .where(and(eq(analyticsSiteTable.owner, owner), eq(analyticsSiteTable.repo, repo)))
    .limit(1);
  if (rows.length === 0) return { ok: false, reason: `No analytics_site for ${owner}/${repo}` };

  const site = rows[0];
  const data = await getDigestData(site.id);
  const siteName = friendlyName(site.repo);
  const ownerRepo = `${site.owner}/${site.repo}`;
  const dashboardUrl = `${getBaseUrl()}/${site.owner}/${site.repo}/analytics`;
  const html = await render(
    WeeklyDigestEmailTemplate({ siteName, ownerRepo, data, dashboardUrl }),
  );
  const recipients = Array.isArray(site.digestRecipients) ? (site.digestRecipients as string[]) : [];
  return {
    ok: true,
    subject: `${siteName} weekly report · ${data.window.currentStart} → ${data.window.currentEnd}`,
    html,
    recipients,
  };
};

export const sendDigestForSite = async (site: AnalyticsSiteRecord): Promise<DigestSendResult> => {
  try {
    const rendered = await renderDigest(site);
    if (!rendered) {
      return { ok: false, owner: site.owner, repo: site.repo, reason: "No recipients" };
    }
    await sendEmail({
      to: rendered.recipients,
      subject: rendered.subject,
      html: rendered.html,
    });
    return { ok: true, owner: site.owner, repo: site.repo, recipientCount: rendered.recipients.length };
  } catch (error) {
    return {
      ok: false,
      owner: site.owner,
      repo: site.repo,
      reason: error instanceof Error ? error.message : "unknown digest error",
    };
  }
};

export const sendAllDigests = async (): Promise<DigestSendResult[]> => {
  const sites = await db
    .select()
    .from(analyticsSiteTable)
    .where(eq(analyticsSiteTable.digestEnabled, true));

  void brand; // branding is already baked into the rendered HTML via the template

  const results: DigestSendResult[] = [];
  for (const site of sites) {
    results.push(await sendDigestForSite(site));
  }
  return results;
};
