#!/usr/bin/env node
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

async function main() {
  const host = "127.0.0.1";
  const port = Number(args.port || 8787);
  const baseUrl = trimSlash(
    args.baseUrl ||
      process.env.BASE_URL ||
      process.env.BETTER_AUTH_URL ||
      "http://localhost:3000",
  );
  const appName = (args.appName || "Pages CMS").trim();
  const ownerType = args.ownerType === "org" ? "org" : "personal";
  const orgSlug = ownerType === "org" ? (args.org || "").trim() : "";
  const state = randomBytes(16).toString("hex");
  const webhookSecret = randomBytes(32).toString("base64url");

  if (ownerType === "org" && !orgSlug) {
    throw new Error("Missing --org <slug> when --owner-type org.");
  }

  const localCallbackUrl = `http://${host}:${port}/api/github-app/callback`;
  const userAuthorizationCallbackUrl = `${baseUrl}/api/auth/callback/github`;
  const webhookUrl = `${baseUrl}/api/webhook/github`;
  const setupUrl = `${baseUrl}/`;

  const manifest = {
    name: appName,
    url: baseUrl,
    callback_urls: [userAuthorizationCallbackUrl],
    redirect_url: localCallbackUrl,
    description:
      "Pages CMS is an open source CMS for editing content in GitHub repositories.",
    public: false,
    default_permissions: {
      contents: "write",
      metadata: "read",
      emails: "read",
    },
    default_events: [
      "push",
    ],
    request_oauth_on_install: false,
    setup_on_update: true,
    setup_url: setupUrl,
    hook_attributes: {
      url: webhookUrl,
      active: true,
    },
  };

  const appCreationUrl =
    ownerType === "org"
      ? `https://github.com/organizations/${encodeURIComponent(orgSlug)}/settings/apps/new?state=${encodeURIComponent(state)}`
      : `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`;

  const code = await runLocalFlow({
    host,
    port,
    state,
    appCreationUrl,
    manifest,
    autoOpen: args.open,
  });

  const converted = await exchangeManifestCode(code);
  const envPath = args.envPath ? resolve(process.cwd(), args.envPath) : "";
  const authSecret =
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    randomBytes(32).toString("base64url");

  const envValues = {
    BASE_URL: baseUrl,
    BETTER_AUTH_SECRET: authSecret,
    GITHUB_APP_ID: String(converted.id),
    GITHUB_APP_NAME: converted.slug,
    GITHUB_APP_CLIENT_ID: converted.client_id,
    GITHUB_APP_CLIENT_SECRET: converted.client_secret,
    GITHUB_APP_PRIVATE_KEY: wrapQuoted(escapeNewlines(converted.pem || "")),
    GITHUB_APP_WEBHOOK_SECRET: webhookSecret,
  };

  if (envPath) {
    upsertEnv(envPath, envValues);
  }

  console.log("\nGitHub App created.");
  console.log(`- App: ${converted.name} (${converted.slug})`);
  if (envPath) {
    console.log(`- Env file updated: ${envPath}`);
  } else {
    console.log("- Env vars:");
    for (const [key, value] of Object.entries(envValues)) {
      console.log(`  ${key}=${value}`);
    }
    console.log("\nPass --env <path> to write them to a file automatically.");
  }
  console.log(`- User authorization callback: ${userAuthorizationCallbackUrl}`);
  console.log(`- Setup URL: ${setupUrl}`);
  console.log("");
  console.log("NOTE: GitHub no longer accepts `secret` in hook_attributes via the manifest.");
  console.log("The app was created without a webhook secret. To finish wiring webhooks:");
  console.log(`  1. Open https://github.com/settings/apps/${converted.slug}`);
  console.log(`  2. Scroll to Webhook > Secret and paste the value of GITHUB_APP_WEBHOOK_SECRET:`);
  console.log(`     ${webhookSecret}`);
  console.log("  3. Click \"Save changes\".");
  console.log(`- Webhook URL: ${webhookUrl}`);
  console.log("\nNext:");
  console.log("1) Install the app on your target account/repositories.");
  console.log("   Disable 'User-to-server token expiration' if GitHub shows that option.");
  console.log("2) Start Pages CMS.");
}

main().catch((error) => {
  console.error(`\nSetup failed: ${toMessage(error)}`);
  process.exit(1);
});

async function runLocalFlow({
  host,
  port,
  state,
  appCreationUrl,
  manifest,
  autoOpen,
}) {
  let resolveCode;
  let rejectCode;

  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const startPath = "/start";
  const callbackPath = "/api/github-app/callback";

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${host}:${port}`);

    if (url.pathname === startPath) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderAutoPostPage({ appCreationUrl, manifest }));
      return;
    }

    if (url.pathname === callbackPath) {
      const incomingState = url.searchParams.get("state") || "";
      const code =
        url.searchParams.get("code") ||
        url.searchParams.get("temporary_code") ||
        "";
      const error = url.searchParams.get("error") || "";

      if (error) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        res.end(`Error from GitHub: ${error}`);
        rejectCode(new Error(`GitHub returned error: ${error}`));
        return;
      }

      if (incomingState !== state) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        res.end("Invalid state. Return to terminal.");
        rejectCode(new Error("OAuth state mismatch while creating GitHub App."));
        return;
      }

      if (!code) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        res.end("No temporary code received.");
        rejectCode(new Error("Missing temporary code in callback URL."));
        return;
      }

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>GitHub App created.</h1><p>Return to terminal.</p>");
      resolveCode(code);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const launchUrl = `http://${host}:${port}${startPath}`;
  console.log(`\nOpen this URL if browser does not open automatically:\n${launchUrl}`);
  if (autoOpen) tryOpenBrowser(launchUrl);

  const timeoutMs = 10 * 60 * 1000;
  const timeoutId = setTimeout(
    () => rejectCode(new Error("Timed out waiting for browser callback.")),
    timeoutMs,
  );

  try {
    return await codePromise;
  } finally {
    clearTimeout(timeoutId);
    server.close();
  }
}

function renderAutoPostPage({ appCreationUrl, manifest }) {
  const escapedAction = escapeHtml(appCreationUrl);
  const escapedManifest = escapeHtml(JSON.stringify(manifest));

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GitHub App Setup</title>
  </head>
  <body>
    <form id="manifest-form" method="post" action="${escapedAction}">
      <input type="hidden" name="manifest" value="${escapedManifest}" />
      <noscript>
        <p>JavaScript is disabled. Click continue.</p>
        <button type="submit">Continue</button>
      </noscript>
    </form>
    <script>
      document.getElementById("manifest-form").submit();
    </script>
  </body>
</html>`;
}

async function exchangeManifestCode(code) {
  const response = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub manifest conversion failed (${response.status}): ${body}`,
    );
  }

  return response.json();
}

function upsertEnv(filePath, values) {
  const lines = existsSync(filePath)
    ? readFileSync(filePath, "utf8").split(/\r?\n/)
    : [];

  const nextLines = [...lines];

  for (const [key, rawValue] of Object.entries(values)) {
    const value = rawValue == null ? "" : String(rawValue);
    const line = `${key}=${value}`;
    const index = nextLines.findIndex((existing) =>
      existing.startsWith(`${key}=`),
    );

    if (index >= 0) nextLines[index] = line;
    else nextLines.push(line);
  }

  writeFileSync(
    filePath,
    `${nextLines.join("\n").replace(/\n+$/g, "")}\n`,
    "utf8",
  );
}

function tryOpenBrowser(url) {
  const platform = process.platform;

  if (platform === "darwin") {
    execFile("open", [url], () => {});
    return;
  }

  if (platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], () => {});
    return;
  }

  execFile("xdg-open", [url], () => {});
}

function parseArgs(argv) {
  const result = {
    help: false,
    port: "",
    envPath: "",
    baseUrl: "",
    appName: "",
    ownerType: "",
    org: "",
    open: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--port") result.port = argv[++i] || "";
    else if (arg === "--env") result.envPath = argv[++i] || "";
    else if (arg === "--base-url") result.baseUrl = argv[++i] || "";
    else if (arg === "--app-name") result.appName = argv[++i] || "";
    else if (arg === "--owner-type") result.ownerType = argv[++i] || "";
    else if (arg === "--org") result.org = argv[++i] || "";
    else if (arg === "--no-open") result.open = false;
  }

  return result;
}

function printHelp() {
  console.log(
    [
      "GitHub App setup helper",
      "",
      "Usage:",
      "  node scripts/setup-github-app.mjs [options]",
      "",
      "Options:",
      "  --base-url <url>         App base URL (default: http://localhost:3000)",
      "  --app-name <name>        GitHub App display name (default: Pages CMS)",
      "  --owner-type <type>      personal or org (default: personal)",
      "  --org <slug>             Organization slug when owner-type=org",
      "  --port <number>          Local callback port (default: 8787)",
      "  --env <path>             Write generated env vars to this file",
      "  --no-open                Do not try to open browser automatically",
      "  -h, --help               Show help",
      "",
      "Examples:",
      "  node scripts/setup-github-app.mjs --base-url http://localhost:3000",
      "  node scripts/setup-github-app.mjs --owner-type org --org my-company --base-url https://cms.example.com",
    ].join("\n"),
  );
}

function trimSlash(value) {
  return value.replace(/\/+$/g, "");
}

function escapeNewlines(value) {
  return value.replace(/\r\n/g, "\n").replace(/\n/g, "\\n");
}

function wrapQuoted(value) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
