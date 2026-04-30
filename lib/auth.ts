import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { brand } from "@/lib/brand";
import { repairLegacyGithubStubOnLogin } from "@/lib/github-legacy-stub-repair";
import { sendEmail } from "@/lib/mailer";
import { syncGithubProfileOnLogin } from "@/lib/github-account";
import { bindCollaboratorInvitesToUser } from "@/lib/collaborator-access";
import { LoginEmailTemplate } from "@/components/email/login";
import { render } from "@react-email/render";

const parseAdminEmails = () =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const isAdminEmail = (email: string) => parseAdminEmails().includes(email.toLowerCase());

const hasCollaboratorInvite = async (email: string) => {
  const rows = await db
    .select({ id: schema.collaboratorTable.id })
    .from(schema.collaboratorTable)
    .where(sql`lower(${schema.collaboratorTable.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return rows.length > 0;
};

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
    user: {
      create: {
        before: async (user) => {
          const email = (user.email || "").trim().toLowerCase();
          if (!email) {
            throw new APIError("BAD_REQUEST", { message: "Email is required to sign up." });
          }
          if (isAdminEmail(email)) return { data: user };
          if (await hasCollaboratorInvite(email)) return { data: user };
          throw new APIError("FORBIDDEN", {
            message: "Sign-ups are invite-only. Ask an admin to send you a collaborator invite.",
          });
        },
      },
    },
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
          subject: `Sign in link for ${brand.name}`,
          html,
        });
      },
    }),
  ],
});
