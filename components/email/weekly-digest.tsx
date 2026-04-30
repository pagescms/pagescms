import * as React from "react";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";
import { emailTheme } from "@/components/email/theme";
import { brand } from "@/lib/brand";
import type { DigestData, DigestKpi } from "@/lib/analytics/digest-query";

type Props = {
  siteName: string; // repo slug or friendly name
  ownerRepo: string; // "owner/repo" for the dashboard link
  data: DigestData;
  dashboardUrl: string;
};

const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtPct = (n: number) => {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
};

const deltaColor = (delta: number, lowerBetter = false) => {
  const better = lowerBetter ? delta < 0 : delta > 0;
  if (delta === 0) return emailTheme.mutedForeground;
  return better ? "#16a34a" : "#dc2626";
};

const KpiCell = ({
  label,
  kpi,
  lowerBetter = false,
  formatter = fmtNum,
}: {
  label: string;
  kpi: DigestKpi | null;
  lowerBetter?: boolean;
  formatter?: (n: number) => string;
}) => {
  if (!kpi) {
    return (
      <Column align="center" style={{ padding: "12px", border: `1px solid ${emailTheme.buttonBorder}`, borderRadius: 6 }}>
        <Text style={{ fontSize: 11, color: emailTheme.mutedForeground, margin: 0 }}>{label}</Text>
        <Text style={{ fontSize: 20, fontWeight: 600, margin: "4px 0 0 0", color: emailTheme.mutedForeground }}>—</Text>
      </Column>
    );
  }
  return (
    <Column
      align="center"
      style={{ padding: "12px", border: `1px solid ${emailTheme.buttonBorder}`, borderRadius: 6 }}
    >
      <Text style={{ fontSize: 11, color: emailTheme.mutedForeground, margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 22, fontWeight: 600, margin: "4px 0 0 0", color: emailTheme.foreground }}>
        {formatter(kpi.current)}
      </Text>
      <Text style={{ fontSize: 12, margin: "2px 0 0 0", color: deltaColor(kpi.delta, lowerBetter) }}>
        {fmtPct(kpi.delta)} vs prior week
      </Text>
    </Column>
  );
};

export const WeeklyDigestEmailTemplate = ({ siteName, ownerRepo, data, dashboardUrl }: Props) => {
  const rangeLabel = `${data.window.currentStart} → ${data.window.currentEnd}`;

  return (
    <Html>
      <Head />
      <Preview>{`${siteName} weekly report: ${rangeLabel}`}</Preview>
      <Tailwind>
        <Body
          className="my-auto mx-auto font-sans px-2 antialiased"
          style={{ backgroundColor: emailTheme.background, color: emailTheme.foreground }}
        >
          <Container className="my-[40px] mx-auto p-[20px] max-w-[560px]">
            {brand.logoUrl && (
              <Section className="mt-[8px]">
                <Img src={brand.logoUrl} width="140" alt={brand.name} style={{ margin: "0 auto" }} />
              </Section>
            )}

            <Heading
              className="text-[24px] font-semibold p-0 my-[30px] mx-0 text-center tracking-tight"
              style={{ color: emailTheme.foreground }}
            >
              Weekly report — {siteName}
            </Heading>

            <Text
              className="text-[14px] text-center"
              style={{ color: emailTheme.mutedForeground, marginTop: -12, marginBottom: 24 }}
            >
              {data.window.currentStart} → {data.window.currentEnd} vs {data.window.priorStart} → {data.window.priorEnd}
            </Text>

            <Section style={{ marginBottom: 16 }}>
              <Row>
                <KpiCell label="Clicks" kpi={data.clicks} />
                <Column style={{ width: 8 }} />
                <KpiCell label="Impressions" kpi={data.impressions} />
              </Row>
              <Row style={{ marginTop: 8 }}>
                <KpiCell label="Sessions" kpi={data.sessions} />
                <Column style={{ width: 8 }} />
                <KpiCell
                  label="Avg position"
                  kpi={data.position}
                  lowerBetter
                  formatter={(n) => (n ? n.toFixed(1) : "—")}
                />
              </Row>
            </Section>

            {data.movers.length > 0 && (
              <Section style={{ marginTop: 24 }}>
                <Heading as="h2" style={{ fontSize: 15, color: emailTheme.foreground, marginBottom: 8 }}>
                  Biggest query movers
                </Heading>
                <table
                  cellPadding="6"
                  cellSpacing="0"
                  style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
                >
                  <thead>
                    <tr style={{ color: emailTheme.mutedForeground, textAlign: "left" }}>
                      <th style={{ borderBottom: `1px solid ${emailTheme.buttonBorder}` }}>Query</th>
                      <th style={{ borderBottom: `1px solid ${emailTheme.buttonBorder}`, textAlign: "right" }}>This wk</th>
                      <th style={{ borderBottom: `1px solid ${emailTheme.buttonBorder}`, textAlign: "right" }}>Last wk</th>
                      <th style={{ borderBottom: `1px solid ${emailTheme.buttonBorder}`, textAlign: "right" }}>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movers.map((m) => (
                      <tr key={m.query}>
                        <td style={{ borderBottom: `1px solid ${emailTheme.buttonBorder}` }}>{m.query}</td>
                        <td style={{ borderBottom: `1px solid ${emailTheme.buttonBorder}`, textAlign: "right" }}>
                          {m.current}
                        </td>
                        <td style={{ borderBottom: `1px solid ${emailTheme.buttonBorder}`, textAlign: "right" }}>
                          {m.previous}
                        </td>
                        <td
                          style={{
                            borderBottom: `1px solid ${emailTheme.buttonBorder}`,
                            textAlign: "right",
                            color: deltaColor(m.delta),
                          }}
                        >
                          {fmtPct(m.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            <Section className="text-center mt-[28px] mb-[12px]">
              <Button
                className="rounded-lg text-[14px] font-medium no-underline text-center px-5 py-3"
                href={dashboardUrl}
                style={{
                  backgroundColor: emailTheme.buttonBackground,
                  border: `1px solid ${emailTheme.buttonBorder}`,
                  color: emailTheme.buttonForeground,
                }}
              >
                Open full dashboard
              </Button>
            </Section>

            <Hr style={{ borderColor: emailTheme.buttonBorder, margin: "24px 0" }} />

            <Text style={{ fontSize: 12, color: emailTheme.mutedForeground, textAlign: "center" }}>
              Data from Google Search Console, Bing Webmaster Tools, and Google Analytics 4.
              Pulled fresh every night. Report run for{" "}
              <span style={{ color: emailTheme.foreground }}>{ownerRepo}</span>.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
