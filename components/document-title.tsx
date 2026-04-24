"use client";

import { useEffect } from "react";
import { brand } from "@/lib/brand";

export const formatDocumentTitle = (title?: string | null) =>
  title ? `${title} | ${brand.name}` : brand.defaultTitle;

export const formatRepoBranchTitle = (
  title: string,
  owner: string,
  repo: string,
  branch?: string,
) => {
  const repoRef = `${owner}/${repo}${branch ? `@${branch}` : ""}`;
  return `${title} | ${repoRef}`;
};

export function DocumentTitle({
  title,
}: {
  title?: string | null;
}) {
  useEffect(() => {
    document.title = formatDocumentTitle(title);
  }, [title]);

  return null;
}
