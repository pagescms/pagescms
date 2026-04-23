"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, CircleAlert, Loader } from "lucide-react";
import type {
  AnalyticsProvider,
  AnalyticsSiteRow,
  CallTrackingProvider,
} from "@/lib/analytics/types";
import { PROVIDER_LABELS } from "@/lib/analytics/types";

type Props = {
  owner: string;
  repo: string;
  initialSite: AnalyticsSiteRow | null;
};

type FormState = {
  timezone: string;
  gscProperty: string;
  bingSiteUrl: string;
  ga4PropertyId: string;
  callTrackingProvider: CallTrackingProvider | "";
  callrailAccountId: string;
  callrailCompanyId: string;
  whatconvertsAccountId: string;
  whatconvertsProfileId: string;
  netlifySiteId: string;
  digestEnabled: boolean;
  digestRecipients: string;
};

const toFormState = (site: AnalyticsSiteRow | null): FormState => ({
  timezone: site?.timezone ?? "America/New_York",
  gscProperty: site?.gscProperty ?? "",
  bingSiteUrl: site?.bingSiteUrl ?? "",
  ga4PropertyId: site?.ga4PropertyId ?? "",
  callTrackingProvider: site?.callTrackingProvider ?? "",
  callrailAccountId: site?.callrailAccountId ?? "",
  callrailCompanyId: site?.callrailCompanyId ?? "",
  whatconvertsAccountId: site?.whatconvertsAccountId ?? "",
  whatconvertsProfileId: site?.whatconvertsProfileId ?? "",
  netlifySiteId: site?.netlifySiteId ?? "",
  digestEnabled: site?.digestEnabled ?? false,
  digestRecipients: (site?.digestRecipients ?? []).join(", "),
});

export function AnalyticsSettingsForm({ owner, repo, initialSite }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(toFormState(initialSite));
  const [isSaving, setIsSaving] = useState(false);
  const [testing, setTesting] = useState<AnalyticsProvider | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; label: string; detail?: string }[]>>({});

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const body = {
        ...form,
        digestRecipients: form.digestRecipients
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const response = await fetch(`/api/${owner}/${repo}/analytics/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.status) {
        throw new Error(payload?.message || "Failed to save settings.");
      }
      toast.success("Analytics settings saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async (provider: AnalyticsProvider) => {
    setTesting(provider);
    try {
      const response = await fetch(`/api/${owner}/${repo}/analytics/settings/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = await response.json().catch(() => null);
      if (payload?.checks) {
        setTestResults((prev) => ({ ...prev, [provider]: payload.checks }));
      }
      if (payload?.status === "ok") {
        toast.success(`${PROVIDER_LABELS[provider]}: connection ready`);
      } else {
        toast.error(`${PROVIDER_LABELS[provider]}: missing configuration`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed.");
    } finally {
      setTesting(null);
    }
  };

  const renderTestResults = (provider: AnalyticsProvider) => {
    const checks = testResults[provider];
    if (!checks) return null;
    return (
      <div className="mt-2 space-y-1">
        {checks.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <CircleAlert className="h-4 w-4 text-amber-600" />
            )}
            <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
            {c.detail && <span className="text-xs text-muted-foreground">({c.detail})</span>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Google Search Console</CardTitle>
          <CardDescription>
            Property URL. Use <code>sc-domain:example.com</code> or <code>https://example.com/</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="gscProperty">GSC property</Label>
          <Input
            id="gscProperty"
            value={form.gscProperty}
            onChange={(e) => update("gscProperty", e.target.value)}
            placeholder="sc-domain:example.com"
          />
          {renderTestResults("gsc")}
        </CardContent>
        <CardFooter>
          <Button type="button" variant="outline" size="sm" disabled={testing === "gsc"} onClick={() => handleTest("gsc")}>
            {testing === "gsc" && <Loader className="mr-2 h-4 w-4 animate-spin" />}
            Test connection
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bing Webmaster Tools</CardTitle>
          <CardDescription>Full site URL with trailing slash.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="bingSiteUrl">Bing site URL</Label>
          <Input
            id="bingSiteUrl"
            value={form.bingSiteUrl}
            onChange={(e) => update("bingSiteUrl", e.target.value)}
            placeholder="https://example.com/"
          />
          {renderTestResults("bing")}
        </CardContent>
        <CardFooter>
          <Button type="button" variant="outline" size="sm" disabled={testing === "bing"} onClick={() => handleTest("bing")}>
            {testing === "bing" && <Loader className="mr-2 h-4 w-4 animate-spin" />}
            Test connection
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Analytics 4</CardTitle>
          <CardDescription>
            GA4 property ID. Raw number or <code>properties/123456789</code> — both accepted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="ga4PropertyId">GA4 property ID</Label>
          <Input
            id="ga4PropertyId"
            value={form.ga4PropertyId}
            onChange={(e) => update("ga4PropertyId", e.target.value)}
            placeholder="properties/123456789"
          />
          {renderTestResults("ga4")}
        </CardContent>
        <CardFooter>
          <Button type="button" variant="outline" size="sm" disabled={testing === "ga4"} onClick={() => handleTest("ga4")}>
            {testing === "ga4" && <Loader className="mr-2 h-4 w-4 animate-spin" />}
            Test connection
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Call tracking</CardTitle>
          <CardDescription>CallRail and WhatConverts are mutually exclusive per site.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            {(["", "callrail", "whatconverts"] as const).map((value) => (
              <label key={value || "none"} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="callTrackingProvider"
                  value={value}
                  checked={form.callTrackingProvider === value}
                  onChange={() => update("callTrackingProvider", value)}
                />
                {value === "" ? "None" : PROVIDER_LABELS[value]}
              </label>
            ))}
          </div>

          {form.callTrackingProvider === "callrail" && (
            <div className="space-y-2">
              <Label htmlFor="callrailAccountId">CallRail account ID</Label>
              <Input
                id="callrailAccountId"
                value={form.callrailAccountId}
                onChange={(e) => update("callrailAccountId", e.target.value)}
              />
              <Label htmlFor="callrailCompanyId">CallRail company ID</Label>
              <Input
                id="callrailCompanyId"
                value={form.callrailCompanyId}
                onChange={(e) => update("callrailCompanyId", e.target.value)}
              />
              {renderTestResults("callrail")}
              <Button type="button" variant="outline" size="sm" disabled={testing === "callrail"} onClick={() => handleTest("callrail")}>
                {testing === "callrail" && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                Test connection
              </Button>
            </div>
          )}

          {form.callTrackingProvider === "whatconverts" && (
            <div className="space-y-2">
              <Label htmlFor="whatconvertsAccountId">WhatConverts account ID</Label>
              <Input
                id="whatconvertsAccountId"
                value={form.whatconvertsAccountId}
                onChange={(e) => update("whatconvertsAccountId", e.target.value)}
              />
              <Label htmlFor="whatconvertsProfileId">WhatConverts profile ID</Label>
              <Input
                id="whatconvertsProfileId"
                value={form.whatconvertsProfileId}
                onChange={(e) => update("whatconvertsProfileId", e.target.value)}
              />
              {renderTestResults("whatconverts")}
              <Button type="button" variant="outline" size="sm" disabled={testing === "whatconverts"} onClick={() => handleTest("whatconverts")}>
                {testing === "whatconverts" && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                Test connection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Netlify Forms</CardTitle>
          <CardDescription>Netlify site ID — find in the site&apos;s Netlify dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="netlifySiteId">Netlify site ID</Label>
          <Input
            id="netlifySiteId"
            value={form.netlifySiteId}
            onChange={(e) => update("netlifySiteId", e.target.value)}
          />
          {renderTestResults("netlify_forms")}
        </CardContent>
        <CardFooter>
          <Button type="button" variant="outline" size="sm" disabled={testing === "netlify_forms"} onClick={() => handleTest("netlify_forms")}>
            {testing === "netlify_forms" && <Loader className="mr-2 h-4 w-4 animate-spin" />}
            Test connection
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly email digest</CardTitle>
          <CardDescription>
            Sent Monday 8am in the site&apos;s timezone. Rendered with React Email, sent via Resend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="digestEnabled"
              checked={form.digestEnabled}
              onCheckedChange={(checked) => update("digestEnabled", checked)}
            />
            <Label htmlFor="digestEnabled">Send weekly digest</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="digestRecipients">Recipients (comma-separated)</Label>
            <Input
              id="digestRecipients"
              value={form.digestRecipients}
              onChange={(e) => update("digestRecipients", e.target.value)}
              placeholder="client@example.com, owner@example.com"
              disabled={!form.digestEnabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone (IANA)</Label>
            <Input
              id="timezone"
              value={form.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              placeholder="America/New_York"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
