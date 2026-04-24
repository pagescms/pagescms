import { getFileName, normalizePath } from "@/lib/utils/file";
import { brand } from "@/lib/brand";

type CommitAction = "create" | "update" | "delete" | "rename";
type CommitTemplates = Partial<Record<CommitAction, string>>;
type CommitIdentity = "app" | "user";

const defaultCommitTemplates: Record<CommitAction, string> = {
  create: `Create {path} (via ${brand.commitPrefix})`,
  update: `Update {path} (via ${brand.commitPrefix})`,
  delete: `Delete {path} (via ${brand.commitPrefix})`,
  rename: `Rename {oldPath} to {newPath} (via ${brand.commitPrefix})`,
};

const getCommitTemplates = (configObject?: Record<string, any>): CommitTemplates => {
  const templates = configObject?.settings?.commit?.templates;
  return templates && typeof templates === "object" ? templates : {};
};

const resolveCommitIdentity = ({
  configObject,
  identityOverride,
}: {
  configObject?: Record<string, any>;
  identityOverride?: CommitIdentity;
}): CommitIdentity => {
  if (identityOverride === "app" || identityOverride === "user") return identityOverride;

  const identity = configObject?.settings?.commit?.identity;
  return identity === "user" ? "user" : "app";
};

const renderCommitTemplate = (
  template: string,
  tokens: Record<string, string | undefined>,
): string => {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => {
    const value = tokens[token];
    return typeof value === "string" ? value : "";
  });
};

const buildCommitTokens = ({
  action,
  owner,
  repo,
  branch,
  path,
  oldPath,
  newPath,
  contentName,
  user,
  userName,
  userEmail,
}: {
  action: CommitAction;
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  oldPath?: string;
  newPath?: string;
  contentName?: string;
  user?: string;
  userName?: string;
  userEmail?: string;
}): Record<string, string> => {
  const normalizedPath = path ? normalizePath(path) : "";
  const normalizedOldPath = oldPath ? normalizePath(oldPath) : "";
  const normalizedNewPath = newPath ? normalizePath(newPath) : "";

  return {
    action,
    owner,
    repo,
    branch,
    name: contentName || "",
    user: user || userName || userEmail || "",
    userName: userName || "",
    userEmail: userEmail || "",
    path: normalizedPath,
    filename: normalizedPath ? getFileName(normalizedPath) : "",
    oldPath: normalizedOldPath,
    oldFilename: normalizedOldPath ? getFileName(normalizedOldPath) : "",
    newPath: normalizedNewPath,
    newFilename: normalizedNewPath ? getFileName(normalizedNewPath) : "",
  };
};

const resolveCommitMessage = ({
  configObject,
  templatesOverride,
  action,
  tokens,
}: {
  configObject?: Record<string, any>;
  templatesOverride?: CommitTemplates;
  action: CommitAction;
  tokens: Record<string, string | undefined>;
}): string => {
  const globalTemplates = getCommitTemplates(configObject);
  const overrideTemplate = templatesOverride?.[action];
  const template = typeof overrideTemplate === "string" && overrideTemplate.trim()
    ? overrideTemplate
    : (typeof globalTemplates[action] === "string" && globalTemplates[action]?.trim()
      ? (globalTemplates[action] as string)
      : defaultCommitTemplates[action]);
  return renderCommitTemplate(template, tokens).replace(/\s+/g, " ").trim().slice(0, 200);
};

export { buildCommitTokens, resolveCommitIdentity, resolveCommitMessage };
