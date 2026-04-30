"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  owner: string;
  repo: string;
  initialLocationName: string | null;
  initialConnectedAt: Date | null;
};

const reasonMessages: Record<string, string> = {
  no_locations:
    "Authorization succeeded but no GBP locations were found on that Google account. Make sure the account is a manager or owner of the Business Profile.",
  multiple_locations:
    "Multiple GBP locations were found on that Google account. The single-location auto-pick is not safe — pick the right Google account at consent time, or contact support.",
  no_refresh_token:
    "Google did not return a refresh token. Try again — make sure you don't already have an active grant for this app (revoke at myaccount.google.com → Security → Third-party apps).",
  session_mismatch: "The session that initiated the connection no longer matches.",
  no_site: "No analytics site row exists yet — save settings once first.",
  missing_code: "Google did not return an authorization code.",
  access_denied: "You denied the consent screen.",
};

export function GbpConnectCard({
  owner,
  repo,
  initialLocationName,
  initialConnectedAt,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [locationName, setLocationName] = useState(initialLocationName);
  const [connectedAt, setConnectedAt] = useState(initialConnectedAt);

  useEffect(() => {
    const flag = searchParams.get("gbp");
    if (!flag) return;

    if (flag === "success") {
      const loc = searchParams.get("location") ?? "your location";
      toast.success(`Connected to Google Business Profile: ${loc}`);
    } else if (flag === "error") {
      const reason = searchParams.get("reason") ?? "unknown";
      const msg = reasonMessages[reason] ?? `GBP connection failed: ${reason}`;
      toast.error(msg);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("gbp");
    params.delete("reason");
    params.delete("location");
    params.delete("count");
    const cleaned = params.toString();
    const href = cleaned ? `?${cleaned}` : window.location.pathname;
    router.replace(href, { scroll: false });
  }, [searchParams, router]);

  const handleConnect = () => {
    window.location.href = `/api/${owner}/${repo}/analytics/gbp/authorize`;
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const response = await fetch(`/api/${owner}/${repo}/analytics/gbp/disconnect`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.status !== "ok") {
        throw new Error(payload?.message || "Failed to disconnect");
      }
      setLocationName(null);
      setConnectedAt(null);
      toast.success("Disconnected from Google Business Profile.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Disconnect failed.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = Boolean(locationName);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Business Profile</CardTitle>
        <CardDescription>
          {isConnected
            ? "Connected. PaperClip can now manage posts, reviews, Q&A, and rank tracking on this profile."
            : "Connect a Google account that has manager or owner access to this site's GBP. The refresh token is encrypted at rest; PaperClip mints short-lived access tokens server-side."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isConnected && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>{locationName}</span>
            {connectedAt && (
              <span className="text-xs text-muted-foreground">
                (connected {new Date(connectedAt).toLocaleDateString()})
              </span>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {isConnected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDisconnecting}
            onClick={handleDisconnect}
          >
            {isDisconnecting ? (
              <Loader className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Unplug className="mr-2 h-4 w-4" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleConnect}>
            Connect Google Business Profile
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
