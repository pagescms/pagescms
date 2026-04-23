# Plan: Client Reporting Dashboard (GSC + Bing Webmaster)

Fork: `geopopos/pagescms` (origin) • upstream: `pagescms/pagescms`
Stack already in place: Next.js 16 App Router, React 19, Drizzle + Postgres, Better Auth (magic link + GitHub OAuth), Octokit GitHub App, Tailwind, `@tanstack/react-table`.

## Goal

Add an **Analytics** tab alongside the existing content editor at `/[owner]/[repo]` so a client who logs into Pages CMS to edit their site also sees daily performance trends for that same site — GSC clicks/impressions/CTR/avg-position and Bing clicks/impressions, with day-over-day deltas.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (magic-link auth)                                        │
│  /[owner]/[repo]/analytics   ← NEW dashboard page                │
│  /[owner]/[repo]/analytics/settings  ← map repo → GSC/Bing site  │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│  Next.js API routes (NEW)                                        │
│  /api/[owner]/[repo]/analytics/summary                           │
│  /api/[owner]/[repo]/analytics/timeseries                        │
│  /api/[owner]/[repo]/analytics/top-queries                       │
│  /api/[owner]/[repo]/analytics/top-pages                         │
│  /api/[owner]/[repo]/analytics/settings (GET/PATCH)              │
│  /api/cron/sync-analytics  ← Vercel Cron, daily at 04:00 UTC     │
└──────────────────┬──────────────────────────────────────────────┘
                   │
     ┌─────────────┼───────────────┐
     ▼             ▼               ▼
┌────────┐   ┌──────────┐   ┌────────────────┐
│ GSC    │   │ Bing WMT │   │ Postgres cache │
│ API    │   │ API      │   │ (Drizzle)      │
└────────┘   └──────────┘   └────────────────┘
```

Pulls are **cached in Postgres** — dashboards read from cache, never hit GSC/Bing on page load. A daily cron refreshes 7/28/90/16-month windows per site.

## New Drizzle tables (`db/schema.ts`)

```ts
// Per-repo binding to external search engine properties
analyticsSite = pgTable("analytics_site", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),          // matches [owner] route
  repo: text("repo").notNull(),            // matches [repo] route
  gscProperty: text("gsc_property"),       // sc-domain:example.com or https://...
  bingSiteUrl: text("bing_site_url"),      // https://example.com/
  timezone: text("timezone").default("America/New_York"),
  createdAt, updatedAt,
}, t => ({ uq: uniqueIndex("uq_site_owner_repo").on(t.owner, t.repo) }));

// Encrypted per-tenant credentials (reuse lib/crypto.ts pattern used for GH tokens)
analyticsCredential = pgTable("analytics_credential", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => analyticsSite.id, {onDelete:"cascade"}),
  provider: text("provider").notNull(),    // 'gsc' | 'bing'
  ciphertext: text("ciphertext").notNull(),// { kind:'service_account'|'oauth'|'api_key', ... }
  iv: text("iv").notNull(),
});

// Daily rollup — one row per (site, provider, date)
analyticsDaily = pgTable("analytics_daily", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => analyticsSite.id, {onDelete:"cascade"}),
  provider: text("provider").notNull(),    // 'gsc' | 'bing'
  date: text("date").notNull(),            // YYYY-MM-DD
  clicks: integer("clicks").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  ctr: text("ctr"),                        // store as string to preserve precision
  position: text("position"),              // avg position (GSC only)
  fetchedAt: timestamp("fetched_at").defaultNow(),
}, t => ({ uq: uniqueIndex("uq_daily").on(t.siteId, t.provider, t.date) }));

// Dimension breakdowns — top queries, top pages
analyticsDimension = pgTable("analytics_dimension", {
  id: serial("id").primaryKey(),
  siteId, provider, date,
  dimension: text("dimension").notNull(), // 'query' | 'page' | 'country' | 'device'
  value: text("value").notNull(),          // the query string or URL
  clicks, impressions, ctr, position,
}, t => ({ idx: index("idx_dim").on(t.siteId, t.provider, t.date, t.dimension) }));
```

## Credentials strategy (choose one, recommend hybrid)

- **Agency-owned (default, fast):** encrypt the existing GSC service-account JSON + a single Bing API key with `CRYPTO_KEY`, store one row per site in `analytics_credential`. Client never sees keys. You must add the service account as an "Owner" in each GSC property (already in your post-deploy QA).
- **Client-owned OAuth (v2):** add Google OAuth scope `webmasters.readonly` and a "Connect Google" button in settings. Store refresh tokens encrypted. Bing has no OAuth — stays API-key based.

Start with agency-owned. Add OAuth later if a client asks.

## Sync job (`app/api/cron/sync-analytics/route.ts`)

Runs daily via Vercel Cron (`vercel.ts` → `crons: [{ path:'/api/cron/sync-analytics', schedule:'0 4 * * *' }]`).

For each `analytics_site`:
1. **GSC** — `searchanalytics.query` with `startDate = today-3`, `endDate = today-1` (GSC lag is ~48h). Fetch with dimensions `['date']` for timeseries, then `['query']` and `['page']` top-N for dimension table. Upsert into `analytics_daily` + `analytics_dimension`.
2. **Bing** — `GetRankAndTrafficStats` for timeseries, `GetQueryStats` / `GetPageStats` for dimensions. Same upsert pattern.
3. Backfill: on first connect, pull last 90 days in one sweep.

You already have both clients in `/home/georgieporgie/claude_work/local-seo-site-builder/utils/seo-audit/{google-search-console.js,bing-webmaster-tools.js}` — port them to `lib/analytics/gsc.ts` and `lib/analytics/bing.ts` as TypeScript.

## UI (`app/(main)/[owner]/[repo]/analytics/page.tsx`)

Components to build (reuse Radix + Tailwind already in repo):
- **KPI cards** — Clicks / Impressions / CTR / Avg Position, with day-over-day % delta and sparkline
- **Timeseries chart** — stacked GSC + Bing clicks by day (use `recharts` — add dep; ~50KB gzipped)
- **Top Queries table** (`@tanstack/react-table`, already installed) — sortable, with `Δ clicks` column vs prior period
- **Top Pages table** — same pattern, links open in new tab
- **Source toggle** — GSC / Bing / Combined
- **Date range picker** — 7d / 28d / 90d / 16mo presets (use `date-fns`, already installed)

All data read from `/api/[owner]/[repo]/analytics/*` which query the Postgres cache — **no external API calls during page render**.

## Permissions

Reuse existing `lib/authz-server.ts` + `lib/collaborator-access.ts` — a user can view `/[owner]/[repo]/analytics` iff they can view the repo. No new roles needed for v1. Later: add a `view_analytics`-only role for read-only clients.

## Settings page

`app/(main)/[owner]/[repo]/analytics/settings/page.tsx` — three fields:
- GSC property (auto-detect from repo's deployed domain via `.pages.yml` hints; manual override)
- Bing site URL
- "Test connection" button → server action that fires a tiny GSC/Bing query and returns pass/fail

## Rollout

1. **Branch** `feat/analytics-dashboard` off `main` on the fork
2. **PR 1** — schema + migration + credential encryption + settings page (no data yet)
3. **PR 2** — sync job + backfill + cached read endpoints
4. **PR 3** — UI (KPI cards + timeseries)
5. **PR 4** — top queries/pages tables + date range + CSV export
6. **Deploy** on Vercel (separate project from `app.pagescms.org`, e.g. `cms.volumeup.agency`) so we don't drift from upstream — keep `upstream/main` mergeable.

## Decisions (locked 2026-04-22)

1. **Same Pages CMS login** — dashboard lives at `/[owner]/[repo]/analytics`. One magic link, one session.
2. **Agency-owned credentials for v1** — encrypt existing GSC service-account JSON + single Bing API key with `CRYPTO_KEY`. OAuth deferred to v2.
3. **Weekly PDF email digests in v1** — Monday 8:00 local, rendered with `@react-email/components` (already in deps), sent with `resend` (already in deps). One email per site per week; recipient list stored on `analytics_site`.
4. **Data sources in v1**: GSC, Bing Webmaster, **GA4, CallRail, WhatConverts, Netlify Forms**.

## Expanded data source matrix (**endpoints verified against official docs 2026-04-22**)

| Provider | Base URL | Auth (verified) | Endpoints (verified) | Per-site identifier | Metrics | Dimensions |
|---|---|---|---|---|---|---|
| `gsc` | `https://www.googleapis.com/webmasters/v3/` (via `googleapis` SDK — mirror `local-seo-site-builder/utils/seo-audit/google-search-console.js`) | Service account JSON, scope `webmasters.readonly` | `searchconsole.searchanalytics.query({siteUrl,startDate,endDate,dimensions,rowLimit})` | `siteUrl` (`sc-domain:example.com` or `https://example.com/`) | clicks, impressions, ctr, position | query, page, country, device, date |
| `bing` | `https://ssl.bing.com/webmaster/api.svc/json/` (mirror `bing-webmaster-tools.js`) | `?apikey=KEY` query param — **one key per Bing WMT user**, covers all sites verified under that user | `GET GetRankAndTrafficStats?siteUrl=…`, `GET GetQueryStats?siteUrl=…`, `GET GetPageStats?siteUrl=…` | `siteUrl` (full URL with trailing `/`) | clicks, impressions | query, page |
| `ga4` | `https://analyticsdata.googleapis.com` | Service account JSON (same one as GSC, add scope `analytics.readonly`) | `POST /v1beta/{property=properties/*}:runReport` with body `{dimensions, metrics, dateRanges}` | `propertyId` (store as `properties/{id}`) | sessions, activeUsers, engagedSessions, screenPageViews, conversions | sessionSourceMedium, landingPage, deviceCategory, date |
| `callrail` | `https://api.callrail.com/v3/` | `Authorization: Token token="API_KEY"` — **agency admin key scopes across all accounts the user has access to** | `GET /v3/a/{account_id}/calls.json`, `GET /v3/a/{account_id}/calls/summary.json`, both accept `start_date`/`end_date` or standardized date ranges; supports relative pagination (`relative_pagination=true`, `per_page` up to 250) | `account_id` + `company_id` (filter via `?company_id=…`) | calls, total_calls, total_calls_first_time, avg_duration (from summary endpoint) | source, keyword, tracker, date |
| `whatconverts` | `https://app.whatconverts.com/api/v1/` | **HTTP Basic with `token:secret` pair** (two values, not one API key) — agency key supports `account_id` + `profile_id` filters | `GET /leads` with params `account_id`, `profile_id`, `lead_type` (`phone_call`, `web_form`, `chat`, etc.), `lead_status`, `start_date`, `end_date` (ISO 8601 UTC, max 400-day range), `leads_per_page` (max 2500), `page_number` | `account_id` + `profile_id` | leads, quotable, quote_value, sales_value, lead_score, spam, duplicate | lead_type, lead_source, lead_status, date_created |
| `netlify_forms` | `https://api.netlify.com/api/v1/` | `Authorization: Bearer {PAT}` (OAuth2 PAT) | `GET /sites/{site_id}/forms`, `GET /sites/{site_id}/submissions` | `site_id` | submission_count per form, submissions | form name, date |

**Per-provider notes from verification:**

- **Bing API key is per-user, not per-site** — "A user can use the same API key for all their verified sites on Bing Webmaster Tools" (Microsoft Learn). OAuth2 is also supported; stick with API key for v1.
- **CallRail API key is scoped to a user** — "API responses will only include data pertaining to the user's API key... Calls placed to accounts or companies where the user has no access will not be returned." Use an admin-level user for agency key.
- **CallRail data retention is 25 months** — requests outside this window return an error. Cap backfill at 24 months.
- **WhatConverts uses HTTP Basic with token:secret** — store **both** values encrypted. Max 400 days per date range.
- **GA4 `property` path param** is `properties/{numericId}`, not just the number. Settings page should accept either and normalize.
- **GA4 MCP server exists** (`github.com/googleanalytics/google-analytics-mcp`) — consider later; REST API is simpler for a server-side cron.
- **Netlify PAT** has full account scope — agency PAT covers every site. Could also generate per-site deploy keys later if scope reduction is needed.

Every endpoint above was confirmed by fetching the official docs today. Only the **metric names** (e.g. CallRail's summary field names, WhatConverts quotable values) need a final pass during PR 2/3 when writing the mapper — those vary by response shape.

## Corrected auth strategy

Agency-owned secrets (env vars on the Pages CMS deployment):
```
GOOGLE_SERVICE_ACCOUNT_JSON_B64   # GSC + GA4 share this
BING_WEBMASTER_API_KEY
CALLRAIL_API_KEY                  # agency admin user
WHATCONVERTS_API_TOKEN
WHATCONVERTS_API_SECRET           # paired with token for HTTP Basic
NETLIFY_PAT                       # agency account
```

Per-site identifiers (stored on `analytics_site` — no secrets):
```
gscProperty        text   (e.g. sc-domain:example.com)
bingSiteUrl        text   (e.g. https://example.com/)
ga4PropertyId      text   (e.g. properties/123456789)
callrailAccountId  text
callrailCompanyId  text
whatconvertsAccountId text
whatconvertsProfileId text
netlifySiteId      text
callTrackingProvider text  -- 'callrail' | 'whatconverts' | null  (mirrors site.json)
```

This keeps `analytics_credential` (encrypted, per-tenant) unused in v1 — every secret lives in the deployment env and is read via `process.env`. We add the `analytics_credential` table anyway but leave it empty until a v2 client asks for OAuth.

**All credentials are agency-owned** — one admin key per provider covers every client account. CallRail and WhatConverts admin API keys scope across all companies/profiles on the account. Settings page only asks for per-site **identifiers** (propertyId, companyId, profileId, siteId), never secrets.

`callrail` vs `whatconverts` is mutually exclusive per site — settings page shows whichever matches the site's `callTrackingProvider` in `.pages.yml` / `site.json`.

## Schema change — generalize metrics to `jsonb`

Original plan had fixed columns (`clicks, impressions, ctr, position`) which only fits GSC/Bing. Switch to:

```ts
analyticsDaily = pgTable("analytics_daily", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => analyticsSite.id, {onDelete:"cascade"}),
  provider: text("provider").notNull(),  // gsc|bing|ga4|callrail|whatconverts|netlify_forms
  date: text("date").notNull(),          // YYYY-MM-DD (site timezone)
  metrics: jsonb("metrics").notNull(),   // provider-specific — see matrix above
  fetchedAt: timestamp("fetched_at").defaultNow(),
}, t => ({ uq: uniqueIndex("uq_daily").on(t.siteId, t.provider, t.date) }));

analyticsDimension = pgTable("analytics_dimension", {
  id: serial("id").primaryKey(),
  siteId, provider, date,
  dimension: text("dimension").notNull(), // query|page|source|form|trackingNumber|...
  value: text("value").notNull(),
  metrics: jsonb("metrics").notNull(),
}, t => ({ idx: index("idx_dim").on(t.siteId, t.provider, t.date, t.dimension) }));
```

UI reads `metrics.clicks` for GSC/Bing, `metrics.sessions` for GA4, `metrics.calls` for CallRail, etc. Type-safe wrappers in `lib/analytics/types.ts` so the dashboard doesn't stringly-key into JSONB.

## Settings page — per-provider toggles

`app/(main)/[owner]/[repo]/analytics/settings/page.tsx` gains sections for each provider:
- **GSC** — property URL, test-connection button
- **Bing** — site URL, test-connection button
- **GA4** — GA4 property ID, test-connection
- **Call tracking** — radio: none / CallRail / WhatConverts → if CallRail: account ID + API token; if WhatConverts: profile ID + API token
- **Netlify Forms** — Netlify site ID + PAT, test-connection
- **Email digest** — toggle, recipient list (comma-separated), preview button

Auto-fill from the site's `site.json` and `.pages.yml` where possible (you already store `callTrackingProvider` and `callTrackingId` there).

## Dashboard UX with multi-source data

Tabs across the top of `/[owner]/[repo]/analytics`:
1. **Overview** — combined KPI row (organic clicks from GSC+Bing, sessions from GA4, calls from CallRail/WhatConverts, form submissions from Netlify) with DoD + WoW deltas. Single timeseries stacks them as separate lines (toggleable).
2. **Search** — GSC + Bing deep-dive (current plan's queries + pages tables).
3. **Traffic** — GA4 (sessions, top landing pages, top sources).
4. **Leads** — CallRail/WhatConverts calls + Netlify form submissions in one table (`source`, `date`, `duration|fields`, `qualified?`).

## Weekly PDF email digest (v1)

- Cron: `0 13 * * 1` (Monday 13:00 UTC = 8:00 America/Chicago / 9:00 America/New_York).
- For each `analytics_site` with `digestEnabled=true`:
  1. Build last-week vs prior-week deltas across all enabled providers from `analytics_daily` cache.
  2. Render React Email template (`components/email/weekly-digest.tsx`) with top 5 query movers, calls summary, form submissions count, sparklines as inlined SVG.
  3. Render to PDF via `@react-pdf/renderer` (add dep) OR attach the HTML email directly — **recommend HTML email only in v1**, PDF as a "Download report" link in the dashboard. Saves a dep and renders better on mobile.
  4. Send via Resend to `digestRecipients`.

Add `digestEnabled boolean` and `digestRecipients text[]` to `analytics_site`.

## Revised rollout

1. **PR 1** — schema (jsonb metrics) + migration + credential encryption + multi-provider settings page + test-connection server actions
2. **PR 2** — sync job: GSC + Bing (port existing utils) + Postgres cache
3. **PR 3** — sync job: GA4 + CallRail + WhatConverts + Netlify Forms
4. **PR 4** — Overview + Search dashboard tabs
5. **PR 5** — Traffic + Leads dashboard tabs
6. **PR 6** — Weekly email digest + "Download HTML report" link
