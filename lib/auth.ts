import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { repairLegacyGithubStubOnLogin } from "@/lib/github-legacy-stub-repair";
import { sendEmail } from "@/lib/mailer";
import { syncGithubProfileOnLogin } from "@/lib/github-account";
import { bindCollaboratorInvitesToUser } from "@/lib/collaborator-access";
import { LoginEmailTemplate } from "@/components/email/login";
import { render } from "@react-email/render";

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  secret: (process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET) as string,
  user: {
    additionalFields: {
      githubUsername: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      disableImplicitLinking: false,
      updateUserInfoOnLink: true,
      allowUnlinkingAll: false,
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_APP_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET as string,
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: (profile) => ({
        name: profile.name ?? profile.login,
        image: profile.avatar_url ?? null,
        githubUsername: profile.login,
      }),
      scope: ["repo", "user:email"],
      getUserInfo: async (token) => {
        const profileResponse = await fetch("https://api.github.com/user", {
          headers: {
            "User-Agent": "better-auth",
            Authorization: `Bearer ${token.accessToken}`,
          },
        });

        if (!profileResponse.ok) {
          console.warn("[auth] github getUserInfo failed", {
            status: profileResponse.status,
            githubRequestId: profileResponse.headers.get("x-github-request-id"),
            rateLimitRemaining: profileResponse.headers.get("x-ratelimit-remaining"),
          });
          return null;
        }

        const profile = await profileResponse.json();

        let emails:
          | Array<{ email: string; primary: boolean; verified: boolean; visibility: "public" | "private" }>
          | undefined;
        try {
          const emailsResponse = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${token.accessToken}`,
              "User-Agent": "better-auth",
            },
          });
          if (emailsResponse.ok) {
            emails = await emailsResponse.json();
          }
        } catch {}

        if (!profile.email && emails) {
          profile.email = (emails.find((entry) => entry.primary) ?? emails[0])?.email as string;
        }
        const emailVerified = emails?.find((entry) => entry.email === profile.email)?.verified ?? false;

        const userMap = {
          name: profile.name ?? profile.login,
          image: profile.avatar_url ?? null,
          githubUsername: profile.login,
        };

        return {
          user: {
            id: profile.id,
            email: profile.email,
            emailVerified,
            ...userMap,
          },
          data: profile,
        };
      },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
    },
  }),
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          try {
            await repairLegacyGithubStubOnLogin(session.id, session.userId);
          } catch (error) {
            console.warn("[auth] legacy github stub repair failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          try {
            await syncGithubProfileOnLogin(session.userId);
          } catch (error) {
            console.warn("[auth] github profile sync failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          try {
            const user = await db.query.userTable.findFirst({
              where: (table, { eq }) => eq(table.id, session.userId),
            });
            if (user) {
              await bindCollaboratorInvitesToUser(user);
            }
          } catch (error) {
            console.warn("[auth] collaborator invite binding failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

        },
      },
    },
  },
  plugins: [
    nextCookies(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const html = await render(
          LoginEmailTemplate({
            url,
            email,
          }),
        );

        await sendEmail({
          to: email,
          subject: "Sign in link for Pages CMS",
          html,
        });
      },
    }),
  ],
});
