"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getInstallationRepos, getInstallations } from "@/lib/github-app";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import { InviteEmailTemplate } from "@/components/email/invite";
import { CollaboratorAddedEmailTemplate } from "@/components/email/collaborator-added";
import { render } from "@react-email/render";
import { sendEmail } from "@/lib/mailer";
import { getBaseUrl } from "@/lib/base-url";
import { brand } from "@/lib/brand";
import { db } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { collaboratorTable, verificationTable } from "@/db/schema";
import { z } from "zod";
import { randomBytes, randomUUID } from "crypto";
import { findVerifiedUserByEmail, normalizeEmail } from "@/lib/collaborator-access";

const parseInviteEmails = (raw: FormDataEntryValue | null) => {
  const value = typeof raw === "string" ? raw : "";
  const parts = value
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(parts.map((email) => email.toLowerCase())));
  return z.array(z.string().email()).safeParse(unique);
};

const assertRepoInInstallation = async (
  user: { id: string; githubUsername?: string | null },
  owner: string,
  repo: string
) => {
  const { token, repoAccess } = await requireGithubRepoWriteAccess(
    user,
    owner,
    repo,
    "You must be signed in with GitHub to manage collaborators.",
  );
  const installations = await getInstallations(token, [owner]);
  if (installations.length !== 1) throw new Error(`"${owner}" is not part of your GitHub App installations`);
  const installationRepos = await getInstallationRepos(token, installations[0].id);
  const isInstalledForRepo = installationRepos.some((installationRepo) =>
    installationRepo.id === repoAccess.repoId ||
    (
      installationRepo.owner?.login?.toLowerCase() === owner.toLowerCase() &&
      installationRepo.name?.toLowerCase() === repo.toLowerCase()
    )
  );
  if (!isInstalledForRepo) throw new Error(`"${owner}/${repo}" is not part of your ${brand.name} installation.`);

  return {
    repoAccess,
    installation: installations[0],
  };
};

const getDisplayNameFromEmail = (email: string) => {
  const localPart = email.split("@")[0]?.trim();
  return localPart || email;
};

const generateMagicLinkToken = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = randomBytes(32);
  let token = "";

  for (let i = 0; i < 32; i += 1) {
    token += alphabet[bytes[i] % alphabet.length];
  }

  return token;
};

const createCollaboratorInviteMagicLink = async ({
  email,
  owner,
  repo,
  baseUrl,
}: {
  email: string;
  owner: string;
  repo: string;
  baseUrl: string;
}) => {
  const token = generateMagicLinkToken();
  const redirectPath = `/${owner}/${repo}`;
  const expiresAt = new Date(
    Date.now() + ((Number(process.env.COLLABORATOR_INVITE_LINK_EXPIRES_IN) || 86400) * 1000),
  );

  await db.insert(verificationTable).values({
    id: randomUUID(),
    identifier: token,
    value: JSON.stringify({
      email,
      name: getDisplayNameFromEmail(email),
      owner,
      repo,
      source: "collaborator-invite",
    }),
    expiresAt,
  });

  const inviteUrl = new URL("/sign-in/collaborator", baseUrl);
  inviteUrl.searchParams.set("token", token);
  inviteUrl.searchParams.set("email", email);
  inviteUrl.searchParams.set("owner", owner);
  inviteUrl.searchParams.set("repo", repo);
  inviteUrl.searchParams.set("redirect", redirectPath);

  return inviteUrl.toString();
};

// Invite a collaborator to a repository.
const handleAddCollaborator = async (prevState: any, formData: FormData) => {
	try {
		// TODO: remove the requirement for Github account, let any collaborator invite others
		const session = await auth.api.getSession({
      headers: await headers(),
    });
    const user = session?.user;
		if (!user) throw new Error("You must be signed in with GitHub to invite collaborators.");

		// TODO: add support for branches
		const ownerAndRepoValidation = z.object({
			owner: z.string().trim().min(1),
			repo: z.string().trim().min(1),
		}).safeParse({
			owner: formData.get("owner"),
			repo: formData.get("repo")
		});
		if (!ownerAndRepoValidation.success) throw new Error ("Invalid owner and/or repo");

		const owner = ownerAndRepoValidation.data.owner;
		const repo = ownerAndRepoValidation.data.repo;

    const emailsValidation = parseInviteEmails(formData.get("emails") ?? formData.get("email"));
		if (!emailsValidation.success || emailsValidation.data.length === 0) throw new Error("Invalid email list");
    const emails = emailsValidation.data;

    const { repoAccess, installation } = await assertRepoInInstallation(user, owner, repo);

		const baseUrl = getBaseUrl();
    const repoUrl = new URL(`/${owner}/${repo}`, baseUrl).toString();
    const createdCollaborators: (typeof collaboratorTable.$inferSelect)[] = [];
    const errors: string[] = [];
    let immediateAccessCount = 0;
    let pendingInviteCount = 0;

    for (const email of emails) {
      const normalizedEmail = normalizeEmail(email);
      const existingUser = await findVerifiedUserByEmail(normalizedEmail);
      const collaborator = await db.query.collaboratorTable.findFirst({
				where: and(
        eq(collaboratorTable.ownerId, repoAccess.ownerId),
        eq(collaboratorTable.repoId, repoAccess.repoId),
					sql`lower(${collaboratorTable.email}) = lower(${normalizedEmail})`
      ),
			});
      if (collaborator) {
        if (existingUser && collaborator.userId !== existingUser.id) {
          const updated = await db.update(collaboratorTable)
            .set({ userId: existingUser.id })
            .where(eq(collaboratorTable.id, collaborator.id))
            .returning();
          if (updated.length > 0) {
            createdCollaborators.push(...updated);
            immediateAccessCount += 1;
          }
        }
        errors.push(`${normalizedEmail} is already invited to "${owner}/${repo}".`);
        continue;
      }

      if (!existingUser) {
        const inviteUrl = await createCollaboratorInviteMagicLink({
          email: normalizedEmail,
          owner,
          repo,
          baseUrl,
        });
        try {
          const html = await render(
            InviteEmailTemplate({
              inviteUrl,
              repoName: `${formData.get("owner")}/${formData.get("repo")}`,
              email: normalizedEmail,
              invitedByName: user.name || user.githubUsername || user.email,
              invitedByUrl: `https://github.com/${user.githubUsername}`,
            }),
          );
          await sendEmail({
            to: normalizedEmail,
            subject: `Join "${owner}/${repo}" on ${brand.name}`,
            html,
          });
        } catch (error: any) {
          console.error(`Failed to send invitation email to ${normalizedEmail}:`, error.message);
          errors.push(`${normalizedEmail}: ${error.message}`);
          continue;
        }
      } else {
        try {
          const html = await render(
            CollaboratorAddedEmailTemplate({
              email: normalizedEmail,
              repoName: `${formData.get("owner")}/${formData.get("repo")}`,
              repoUrl,
              invitedByName: user.name || user.githubUsername || user.email,
              invitedByUrl: `https://github.com/${user.githubUsername}`,
            }),
          );
          await sendEmail({
            to: normalizedEmail,
            subject: `You were added to "${owner}/${repo}" on ${brand.name}`,
            html,
          });
        } catch (error: any) {
          console.error(`Failed to send collaborator notification email to ${normalizedEmail}:`, error.message);
          errors.push(`${normalizedEmail}: ${error.message}`);
        }
      }

      const inserted = await db.insert(collaboratorTable).values({
        type: repoAccess.ownerType,
        installationId: installation.id,
        ownerId: repoAccess.ownerId,
        repoId: repoAccess.repoId,
        owner: repoAccess.ownerLogin,
        repo: repoAccess.repoName,
        email: normalizedEmail,
        userId: existingUser?.id ?? null,
        invitedBy: user.id
      }).returning();

      if (inserted.length > 0) {
        createdCollaborators.push(...inserted);
        if (existingUser) {
          immediateAccessCount += 1;
        } else {
          pendingInviteCount += 1;
        }
      }
    }

    if (createdCollaborators.length === 0) {
      throw new Error(errors.join(" "));
    }

		return {
      message:
        immediateAccessCount > 0 && pendingInviteCount > 0
          ? `${immediateAccessCount} collaborator${immediateAccessCount === 1 ? "" : "s"} added immediately and ${pendingInviteCount} invite${pendingInviteCount === 1 ? "" : "s"} sent for "${owner}/${repo}".`
          : immediateAccessCount > 0
            ? `${immediateAccessCount} collaborator${immediateAccessCount === 1 ? "" : "s"} added to "${owner}/${repo}".`
            : pendingInviteCount === 1
              ? `${createdCollaborators[0].email} invited to "${owner}/${repo}".`
              : `${pendingInviteCount} collaborators invited to "${owner}/${repo}".`,
			data: createdCollaborators,
      errors
		};
	} catch (error: any) {
		console.error(error);
		return { error: error.message };
	}
};

// Remove a collaborator from a repository.
const handleRemoveCollaborator = async (collaboratorId: number, owner: string, repo: string) => {
	try {
		const session = await auth.api.getSession({
      headers: await headers(),
    });
    const user = session?.user;
		if (!user) throw new Error("You must be signed in with GitHub to invite collaborators.");

		const collaborator = await db.query.collaboratorTable.findFirst({ where: eq(collaboratorTable.id, collaboratorId) });
		if (!collaborator) throw new Error("Collaborator not found");

    const { repoAccess } = await assertRepoInInstallation(user, owner, repo);

		const deletedCollaborator = await db.delete(collaboratorTable).where(
			and(
				eq(collaboratorTable.id, collaboratorId),
				eq(collaboratorTable.repoId, repoAccess.repoId)
			)
		).returning();

		if (!deletedCollaborator || deletedCollaborator.length === 0) throw new Error("Failed to delete collaborator");

		return { message: `Invitation to ${collaborator.email} for "${owner}/${repo}" successfully removed.` };
	} catch (error: any) {
		console.error(error);
		return { error: error.message };
	}
};

const handleResendCollaboratorInvite = async (collaboratorId: number, owner: string, repo: string) => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    const user = session?.user;
    if (!user) throw new Error("You must be signed in with GitHub to resend collaborator invites.");
    await assertRepoInInstallation(user, owner, repo);

    const collaborator = await db.query.collaboratorTable.findFirst({ where: eq(collaboratorTable.id, collaboratorId) });
    if (!collaborator) throw new Error("Collaborator not found");

    if (collaborator.owner.toLowerCase() !== owner.toLowerCase() || collaborator.repo.toLowerCase() !== repo.toLowerCase()) {
      throw new Error("Collaborator does not belong to this repository.");
    }

    const baseUrl = getBaseUrl();
    const inviteUrl = await createCollaboratorInviteMagicLink({
      email: collaborator.email,
      owner,
      repo,
      baseUrl,
    });

    const html = await render(
      InviteEmailTemplate({
        inviteUrl,
        repoName: `${owner}/${repo}`,
        email: collaborator.email,
        invitedByName: user.name || user.githubUsername || user.email,
        invitedByUrl: `https://github.com/${user.githubUsername}`,
      }),
    );

    await sendEmail({
      to: collaborator.email,
      subject: `Join "${owner}/${repo}" on ${brand.name}`,
      html,
    });

    return { message: `Invitation email resent to ${collaborator.email}.` };
  } catch (error: any) {
    console.error(error);
    return { error: error.message };
  }
};

export { handleAddCollaborator, handleRemoveCollaborator, handleResendCollaboratorInvite };
