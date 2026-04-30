"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { getAuthCallbackURL, getSafeRedirect } from "@/lib/auth-redirect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader } from "lucide-react";

export function SignIn() {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [submittingMethod, setSubmittingMethod] = useState<
    "github" | "email" | null
  >(null);
  const isSubmitting = submittingMethod !== null;

  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";
  const redirectParam = searchParams.get("redirect") || "";
  const safeRedirect = getSafeRedirect(redirectParam);
  const callbackURL = getAuthCallbackURL(safeRedirect);
  const errorCallbackURL =
    safeRedirect === "/"
      ? "/sign-in"
      : `/sign-in?redirect=${encodeURIComponent(safeRedirect)}`;

  const getErrorMessage = (value: string) => {
    if (value.toLowerCase() !== "unable_to_get_user_info") return value;
    return [
      "GitHub denied profile access. Re-authorize Pages CMS in GitHub Settings > Applications > Authorized GitHub Apps / Authorized OAuth Apps, then try again.",
      "https://github.com/settings/applications",
    ].join(" ");
  };

  useEffect(() => {
    if (error) toast.error(getErrorMessage(error), { duration: 12000 });
  }, [error]);

  useEffect(() => {
    const email = searchParams.get("email");
    if (email && emailInputRef.current) emailInputRef.current.value = email;
  }, [searchParams]);

  const getNameFromEmail = (email: string) => {
    const localPart = email.split("@")[0]?.trim();
    return localPart || email;
  };

  const handleGithubSignIn = async () => {
    setSubmittingMethod("github");
    try {
      const result = await signIn.social({
        provider: "github",
        callbackURL,
        errorCallbackURL,
        disableRedirect: true,
      });
      if (result.error?.message) {
        toast.error(result.error.message);
        setSubmittingMethod(null);
        return;
      }

      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }

      setSubmittingMethod(null);
      toast.error("Could not start GitHub sign-in. Please try again.");
    } catch (error: any) {
      toast.error(error?.message || "Could not start GitHub sign-in.");
      setSubmittingMethod(null);
    }
  };

  const handleEmailSignIn = async (formData: FormData) => {
    const emailValue = formData.get("email");
    if (typeof emailValue !== "string" || !emailValue) {
      toast.error("Invalid email");
      return;
    }

    setSubmittingMethod("email");
    try {
      const result = await signIn.magicLink({
        email: emailValue,
        name: getNameFromEmail(emailValue),
        callbackURL,
        errorCallbackURL,
      });

      if (result.error?.message) {
        toast.error(result.error.message);
        return;
      }

      toast.success(
        "We've sent you a link to sign in. If you don't see it, check your spam folder.",
        {
          duration: 10000,
        },
      );
      if (emailInputRef.current) emailInputRef.current.value = "";
    } finally {
      setSubmittingMethod(null);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 flex justify-center items-center">
      <div className="sm:max-w-[340px] w-full space-y-6">
        <h1 className="text-lg font-medium tracking-tight text-center">
          Sign in to Pages CMS
        </h1>
        <Button
          type="button"
          className="w-full"
          onClick={handleGithubSignIn}
          disabled={isSubmitting}
        >
          <svg
            role="img"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
          >
            <title>GitHub</title>
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          Sign in with GitHub
          {submittingMethod === "github" && (
            <Loader className="size-4 animate-spin" />
          )}
        </Button>
        <div className="relative text-center">
          <div className="absolute inset-0 flex items-center">
            <hr className="border-t w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            await handleEmailSignIn(formData);
          }}
        >
          <Input
            ref={emailInputRef}
            type="email"
            name="email"
            placeholder="Email"
            required
            disabled={isSubmitting}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            Send sign-in link
            {submittingMethod === "email" && (
              <Loader className="size-4 animate-spin" />
            )}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          By clicking continue, you agree to our{" "}
          <a
            className="underline hover:decoration-muted-foreground/50"
            href="https://pagescms.org/terms"
            target="_blank"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            className="underline hover:decoration-muted-foreground/50"
            href="https://pagescms.org/privacy"
            target="_blank"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
