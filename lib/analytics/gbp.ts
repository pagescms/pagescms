import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { analyticsCredentialTable, analyticsSiteTable } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { getBaseUrl } from "@/lib/base-url";

const GBP_PROVIDER_KEY = "gbp_oauth";
const GBP_SCOPES = ["https://www.googleapis.com/auth/business.manage"];
const STATE_TTL_SEC = 300;

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
};

const getOAuthConfig = () => ({
  clientId: requireEnv("GBP_OAUTH_CLIENT_ID"),
  clientSecret: requireEnv("GBP_OAUTH_CLIENT_SECRET"),
  redirectUri: `${getBaseUrl()}/api/oauth/gbp/callback`,
});

type StatePayload = {
  owner: string;
  repo: string;
  userId: string;
  exp: number;
};

const buildAuthState = async (payload: Omit<StatePayload, "exp">): Promise<string> => {
  const fullPayload: StatePayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SEC,
  };
  const { ciphertext, iv } = await encrypt(JSON.stringify(fullPayload));
  return Buffer.from(JSON.stringify({ c: ciphertext, i: iv })).toString("base64url");
};

const verifyAuthState = async (state: string): Promise<StatePayload> => {
  let parsed: { c: string; i: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid state format");
  }
  const json = await decrypt(parsed.c, parsed.i);
  const payload = JSON.parse(json) as StatePayload;
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("OAuth state expired — please retry the connection.");
  }
  return payload;
};

const buildAuthUrl = (state: string): string => {
  const cfg = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GBP_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
};

const exchangeCodeForTokens = async (code: string): Promise<TokenResponse> => {
  const cfg = getOAuthConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
};

const refreshAccessToken = async (refreshToken: string): Promise<TokenResponse> => {
  const cfg = getOAuthConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Refresh token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
};

type GbpAccount = { name: string; accountName?: string; type?: string };
type GbpLocation = { name: string; title?: string };

const listAccounts = async (accessToken: string): Promise<GbpAccount[]> => {
  const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`listAccounts failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { accounts?: GbpAccount[] };
  return json.accounts ?? [];
};

const listLocations = async (accessToken: string, accountName: string): Promise<GbpLocation[]> => {
  const url = new URL(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`
  );
  url.searchParams.set("readMask", "name,title");
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`listLocations failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { locations?: GbpLocation[] };
  return json.locations ?? [];
};

type EnumeratedLocation = {
  accountId: string;
  locationId: string;
  locationName: string;
};

const enumerateAllLocations = async (accessToken: string): Promise<EnumeratedLocation[]> => {
  const accounts = await listAccounts(accessToken);
  const out: EnumeratedLocation[] = [];
  for (const acc of accounts) {
    const locations = await listLocations(accessToken, acc.name);
    for (const loc of locations) {
      out.push({
        accountId: acc.name,
        locationId: loc.name,
        locationName: loc.title || loc.name,
      });
    }
  }
  return out;
};

const storeRefreshToken = async (siteId: number, refreshToken: string): Promise<void> => {
  const { ciphertext, iv } = await encrypt(refreshToken);
  await db
    .insert(analyticsCredentialTable)
    .values({ siteId, provider: GBP_PROVIDER_KEY, ciphertext, iv })
    .onConflictDoUpdate({
      target: [analyticsCredentialTable.siteId, analyticsCredentialTable.provider],
      set: { ciphertext, iv, updatedAt: new Date() },
    });
};

const loadRefreshToken = async (siteId: number): Promise<string | null> => {
  const rows = await db
    .select()
    .from(analyticsCredentialTable)
    .where(
      and(
        eq(analyticsCredentialTable.siteId, siteId),
        eq(analyticsCredentialTable.provider, GBP_PROVIDER_KEY)
      )
    )
    .limit(1);
  if (rows.length === 0) return null;
  return decrypt(rows[0].ciphertext, rows[0].iv);
};

const deleteRefreshToken = async (siteId: number): Promise<void> => {
  await db
    .delete(analyticsCredentialTable)
    .where(
      and(
        eq(analyticsCredentialTable.siteId, siteId),
        eq(analyticsCredentialTable.provider, GBP_PROVIDER_KEY)
      )
    );
};

const updateGbpLocationOnSite = async (
  siteId: number,
  accountId: string,
  locationId: string,
  locationName: string
): Promise<void> => {
  await db
    .update(analyticsSiteTable)
    .set({
      gbpAccountId: accountId,
      gbpLocationId: locationId,
      gbpLocationName: locationName,
      gbpConnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(analyticsSiteTable.id, siteId));
};

const clearGbpConnectionOnSite = async (siteId: number): Promise<void> => {
  await db
    .update(analyticsSiteTable)
    .set({
      gbpAccountId: null,
      gbpLocationId: null,
      gbpLocationName: null,
      gbpConnectedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(analyticsSiteTable.id, siteId));
};

const getValidAccessToken = async (siteId: number): Promise<string> => {
  const refreshToken = await loadRefreshToken(siteId);
  if (!refreshToken) throw new Error("Site is not connected to Google Business Profile.");
  const tokens = await refreshAccessToken(refreshToken);
  return tokens.access_token;
};

export {
  GBP_PROVIDER_KEY,
  buildAuthState,
  verifyAuthState,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  enumerateAllLocations,
  storeRefreshToken,
  loadRefreshToken,
  deleteRefreshToken,
  updateGbpLocationOnSite,
  clearGbpConnectionOnSite,
  getValidAccessToken,
};

export type { EnumeratedLocation };
