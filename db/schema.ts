import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  serial,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const userTable = pgTable("user", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  image: text("image"),
  githubUsername: text("github_username"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

const sessionTable = pgTable("session", {
  id: text("id").notNull().primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" })
}, table => ({
  idx_session_userId: index("idx_session_userId").on(table.userId)
}));

const accountTable = pgTable("account", {
  id: text("id").notNull().primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, table => ({
  idx_account_userId: index("idx_account_userId").on(table.userId),
  idx_account_providerId: index("idx_account_providerId").on(table.providerId)
}));

const verificationTable = pgTable("verification", {
  id: text("id").notNull().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, table => ({
  idx_verification_identifier: index("idx_verification_identifier").on(table.identifier)
}));

const githubInstallationTokenTable = pgTable("github_installation_token", {
  id: serial("id").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  installationId: integer("installation_id").notNull(),
  expiresAt: timestamp("expires_at").notNull()
}, table => ({
  uq_github_installation_token_installationId: uniqueIndex("uq_github_installation_token_installationId").on(table.installationId)
}));

const collaboratorTable = pgTable("collaborator", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  installationId: integer("installation_id").notNull(),
  ownerId: integer("owner_id").notNull(),
  repoId: integer("repo_id"),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch"),
  email: text("email").notNull(),
  userId: text("user_id").references(() => userTable.id),
  invitedBy: text("invited_by").references(() => userTable.id)
}, table => ({
  idx_collaborator_owner_repo_email: index("idx_collaborator_owner_repo_email").on(table.owner, table.repo, table.email),
  idx_collaborator_userId: index("idx_collaborator_userId").on(table.userId),
  uq_collaborator_owner_repo_email_ci: uniqueIndex("uq_collaborator_owner_repo_email_ci").on(
    sql`lower(${table.owner})`,
    sql`lower(${table.repo})`,
    sql`lower(${table.email})`,
  ),
}));

const configTable = pgTable("config", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  sha: text("sha").notNull(),
  version: text("version").notNull(),
  object: text("object").notNull(),
  lastCheckedAt: timestamp("last_checked_at").notNull().defaultNow()
}, table => ({
  idx_config_owner_repo_branch: uniqueIndex("idx_config_owner_repo_branch").on(table.owner, table.repo, table.branch)
}));

const cacheFileTable = pgTable("cache_file", {
  id: serial("id").primaryKey(),
  context: text("context").notNull().default('collection'),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  parentPath: text("parent_path").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  type: text("type").notNull(),
  content: text("content"),
  sha: text("sha"),
  size: integer("size"),
  downloadUrl: text("download_url"),
  commitSha: text('commit_sha'),
  commitTimestamp: timestamp('commit_timestamp'),
  updatedAt: timestamp("updated_at").notNull()
}, table => ({
  idx_cache_file_owner_repo_branch_parentPath: index("idx_cache_file_owner_repo_branch_parentPath").on(table.owner, table.repo, table.branch, table.parentPath),
  idx_cache_file_owner_repo_branch_path: uniqueIndex("idx_cache_file_owner_repo_branch_path").on(table.owner, table.repo, table.branch, table.path)
}));

const cacheFileMetaTable = pgTable("cache_file_meta", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  path: text("path").notNull().default(""),
  context: text("context").notNull().default("branch"),
  commitSha: text("commit_sha"),
  commitTimestamp: timestamp("commit_timestamp"),
  status: text("status").notNull().default("ok"),
  error: text("error"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at").notNull().defaultNow(),
}, table => ({
  idx_cache_file_meta_owner_repo_branch_path_context: uniqueIndex("idx_cache_file_meta_owner_repo_branch_path_context").on(table.owner, table.repo, table.branch, table.path, table.context)
}));

const cachePermissionTable = pgTable("cache_permission", {
  id: serial("id").primaryKey(),
  githubId: integer("github_id").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  lastUpdated: timestamp("last_updated").notNull()
}, table => ({
  idx_cache_permission_githubId_owner_repo: uniqueIndex("idx_cache_permission_githubId_owner_repo").on(table.githubId, table.owner, table.repo)
}));

const actionRunTable = pgTable("action_run", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  ref: text("ref").notNull(),
  workflowRef: text("workflow_ref").notNull(),
  sha: text("sha").notNull(),
  actionName: text("action_name").notNull(),
  contextType: text("context_type").notNull(),
  contextName: text("context_name"),
  contextPath: text("context_path"),
  workflow: text("workflow").notNull(),
  workflowRunId: bigint("workflow_run_id", { mode: "number" }),
  status: text("status").notNull(),
  conclusion: text("conclusion"),
  htmlUrl: text("html_url"),
  triggeredBy: jsonb("triggered_by").notNull(),
  failure: jsonb("failure"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, table => ({
  idx_action_run_owner_repo_createdAt: index("idx_action_run_owner_repo_createdAt").on(table.owner, table.repo, table.createdAt),
  idx_action_run_owner_repo_actionName: index("idx_action_run_owner_repo_actionName").on(table.owner, table.repo, table.actionName),
  idx_action_run_owner_repo_status: index("idx_action_run_owner_repo_status").on(table.owner, table.repo, table.status),
  idx_action_run_context: index("idx_action_run_context").on(table.owner, table.repo, table.contextType, table.contextName, table.contextPath),
  idx_action_run_workflowRunId: uniqueIndex("idx_action_run_workflowRunId").on(table.workflowRunId),
}));

const analyticsSiteTable = pgTable("analytics_site", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  gscProperty: text("gsc_property"),
  bingSiteUrl: text("bing_site_url"),
  ga4PropertyId: text("ga4_property_id"),
  callTrackingProvider: text("call_tracking_provider"),
  callrailAccountId: text("callrail_account_id"),
  callrailCompanyId: text("callrail_company_id"),
  whatconvertsAccountId: text("whatconverts_account_id"),
  whatconvertsProfileId: text("whatconverts_profile_id"),
  netlifySiteId: text("netlify_site_id"),
  llmMentionsEnabled: boolean("llm_mentions_enabled").notNull().default(false),
  llmMentionsCompetitors: jsonb("llm_mentions_competitors").notNull().default(sql`'[]'::jsonb`),
  digestEnabled: boolean("digest_enabled").notNull().default(false),
  digestRecipients: jsonb("digest_recipients").notNull().default(sql`'[]'::jsonb`),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => ({
  uq_analytics_site_owner_repo: uniqueIndex("uq_analytics_site_owner_repo").on(table.owner, table.repo),
}));

const analyticsCredentialTable = pgTable("analytics_credential", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => analyticsSiteTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => ({
  uq_analytics_credential_siteId_provider: uniqueIndex("uq_analytics_credential_siteId_provider").on(table.siteId, table.provider),
}));

const analyticsDailyTable = pgTable("analytics_daily", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => analyticsSiteTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  date: text("date").notNull(),
  metrics: jsonb("metrics").notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, table => ({
  uq_analytics_daily: uniqueIndex("uq_analytics_daily").on(table.siteId, table.provider, table.date),
  idx_analytics_daily_siteId_date: index("idx_analytics_daily_siteId_date").on(table.siteId, table.date),
}));

const analyticsDimensionTable = pgTable("analytics_dimension", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => analyticsSiteTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  date: text("date").notNull(),
  dimension: text("dimension").notNull(),
  value: text("value").notNull(),
  metrics: jsonb("metrics").notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, table => ({
  idx_analytics_dimension: index("idx_analytics_dimension").on(table.siteId, table.provider, table.date, table.dimension),
  uq_analytics_dimension_row: uniqueIndex("uq_analytics_dimension_row").on(table.siteId, table.provider, table.date, table.dimension, table.value),
}));

const analyticsActivityTable = pgTable("analytics_activity", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => analyticsSiteTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  source: text("source").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  externalId: text("external_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => ({
  uq_analytics_activity_external: uniqueIndex("uq_analytics_activity_external")
    .on(table.siteId, table.source, table.externalId),
  idx_analytics_activity_siteId_date: index("idx_analytics_activity_siteId_date")
    .on(table.siteId, table.date),
}));

export {
  userTable,
  sessionTable,
  accountTable,
  verificationTable,
  githubInstallationTokenTable,
  collaboratorTable,
  configTable,
  cacheFileTable,
  cacheFileMetaTable,
  cachePermissionTable,
  actionRunTable,
  analyticsSiteTable,
  analyticsCredentialTable,
  analyticsDailyTable,
  analyticsDimensionTable,
  analyticsActivityTable
};
