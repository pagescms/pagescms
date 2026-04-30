"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { getSafeRedirect } from "@/lib/auth-redirect";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader } from "lucide-react";

const GithubAuthExpired = () => {
  const [loading, setLoading] = useState(false);

  const handleSignInAgain = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await signOut();
    } finally {
      const returnTo = getSafeRedirect(`${window.location.pathname}${window.location.search}`);
      const signInUrl =
        returnTo && returnTo !== "/sign-in"
          ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
          : "/sign-in";
      window.location.assign(signInUrl);
    }
  };

  return (
    <Empty className="absolute inset-0 border-0 rounded-none">
      <EmptyHeader>
        <EmptyTitle>GitHub session expired</EmptyTitle>
        <EmptyDescription>Your GitHub session has expired. You&apos;ll need to sign in again.</EmptyDescription>
        <Button variant="ghost" onClick={handleSignInAgain} disabled={loading}>
          <ArrowLeft className="size-4" />
          Sign in another way
          {loading && <Loader className="size-4 animate-spin" />}
        </Button>
      </EmptyHeader>
    </Empty>
  );
};

export { GithubAuthExpired };
