import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";
import { emailTheme } from "@/components/email/theme";
import { brand } from "@/lib/brand";

export const InviteEmailTemplate = ({
  email,
  repoName,
  inviteUrl,
  invitedByName,
  invitedByUrl,
}: {
  email: string;
  repoName: string;
  inviteUrl: string;
  invitedByName: string;
  invitedByUrl: string;
}) => {
  const baseUrl = process.env.BASE_URL
    ? process.env.BASE_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";

  return (
    <Html>
      <Head />
      <Preview>
        {invitedByName} invited you to &quot;{repoName}&quot;
      </Preview>
      <Tailwind>
        <Body
          className="my-auto mx-auto font-sans px-2 antialiased"
          style={{
            backgroundColor: emailTheme.background,
            color: emailTheme.foreground,
          }}
        >
          <Container className="my-[40px] mx-auto p-[20px] max-w-[465px]">
            <Section className="mt-[24px]">
              <Img
                src={`${baseUrl}/images/email-logo.png`}
                width="42"
                height="42"
                alt={brand.name}
                className="my-0 mx-auto"
              />
            </Section>
            <Heading
              className="text-[24px] font-semibold p-0 my-[30px] mx-0 text-center tracking-tight"
              style={{ color: emailTheme.foreground }}
            >
              Join &quot;{repoName}&quot; on {brand.name}
            </Heading>
            <Text
              className="text-[16px] leading-[24px]"
              style={{ color: emailTheme.foreground }}
            >
              <Link
                href={invitedByUrl}
                className="underline rounded-md"
                style={{ color: emailTheme.link }}
              >
                {invitedByName}
              </Link>{" "}
              has invited you to the &quot;{repoName}&quot; project on Pages
              CMS. Use the following link to start collaborating:
            </Text>
            <Section className="text-center mt-[24px] mb-[24px]">
              <Button
                className="rounded-lg text-[14px] font-medium no-underline text-center px-5 py-3"
                href={inviteUrl}
                style={{
                  backgroundColor: emailTheme.buttonBackground,
                  border: `1px solid ${emailTheme.buttonBorder}`,
                  color: emailTheme.buttonForeground,
                }}
              >
                Join &quot;{repoName}&quot;
              </Button>
            </Section>
            <Text
              className="text-[16px] leading-[24px]"
              style={{ color: emailTheme.foreground }}
            >
              or copy and paste this URL into your browser:{" "}
            </Text>
            <Text
              className="text-[16px] leading-[24px]"
              style={{ color: emailTheme.foreground }}
            >
              <Link
                href={inviteUrl}
                className="underline rounded-md"
                style={{ color: emailTheme.link }}
              >
                {inviteUrl}
              </Link>
            </Text>
            <Text
              className="text-[14px] leading-[24px] mt-[36px]"
              style={{ color: emailTheme.mutedForeground }}
            >
              This email was intended for{" "}
              <Link
                href={`mailto:${email}`}
                className="underline"
                style={{ color: emailTheme.mutedLink }}
              >
                {email}
              </Link>
              . If you think this is a mistake, you can safely ignore this
              email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
