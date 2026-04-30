/**
 * White-label branding configuration.
 *
 * All values fall back to upstream Pages CMS defaults when env vars are unset,
 * so this fork can pull upstream changes cleanly. To rebrand, set these in
 * Vercel env (or .env.local for dev):
 *
 *   NEXT_PUBLIC_BRAND_NAME="Page One Local"
 *   NEXT_PUBLIC_BRAND_TITLE_DEFAULT="Client Portal | Page One Local"
 *   NEXT_PUBLIC_BRAND_TITLE_TEMPLATE="%s | Client Portal | Page One Local"
 *   NEXT_PUBLIC_BRAND_LOGO_URL="/brand/logo-dark.svg"
 *   NEXT_PUBLIC_BRAND_DESCRIPTION="Client portal for your website"
 *   NEXT_PUBLIC_BRAND_DOCS_URL=""                     (empty hides doc links)
 *   NEXT_PUBLIC_BRAND_TERMS_URL=""
 *   NEXT_PUBLIC_BRAND_PRIVACY_URL=""
 *   NEXT_PUBLIC_BRAND_SUPPORT_URL="https://pageonelocal.com"
 *   BRAND_COMMIT_PREFIX="Page One Local"             (server-only — commit messages)
 */

const env = (k: string) => {
  const v = process.env[k];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
};

export const brand = {
  /** Short product/company name used inline ("Sign in to X") */
  name: env("NEXT_PUBLIC_BRAND_NAME") ?? "Pages CMS",
  /** Tab title when no page-specific title is set */
  defaultTitle: env("NEXT_PUBLIC_BRAND_TITLE_DEFAULT") ?? "Pages CMS",
  /** Tab title template — use %s for the per-page title */
  titleTemplate: env("NEXT_PUBLIC_BRAND_TITLE_TEMPLATE") ?? "%s | Pages CMS",
  /** Meta description */
  description: env("NEXT_PUBLIC_BRAND_DESCRIPTION") ?? "The No-Hassle CMS for GitHub",
  /** Logo served from /public — used in header, sign-in page */
  logoUrl: env("NEXT_PUBLIC_BRAND_LOGO_URL") ?? "",
  /** Docs URL (falsy = hide the docs links in the UI) */
  docsUrl: env("NEXT_PUBLIC_BRAND_DOCS_URL") ?? "",
  /** Terms and privacy (sign-in footer) — blank hides them */
  termsUrl: env("NEXT_PUBLIC_BRAND_TERMS_URL") ?? "",
  privacyUrl: env("NEXT_PUBLIC_BRAND_PRIVACY_URL") ?? "",
  /** Public-facing marketing URL (e.g., About dropdown) */
  supportUrl: env("NEXT_PUBLIC_BRAND_SUPPORT_URL") ?? "",
  /** Commit message suffix — "(via Pages CMS)" */
  commitPrefix: env("BRAND_COMMIT_PREFIX") ?? env("NEXT_PUBLIC_BRAND_NAME") ?? "Pages CMS",
};
