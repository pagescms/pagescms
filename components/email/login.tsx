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

export const LoginEmailTemplate = ({
  url,
  email,
}: {
  url: string;
  email: string;
}) => {
  const baseUrl = process.env.BASE_URL
    ? process.env.BASE_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";

  return (
    <Html>
      <Head />
      <Preview>{`Sign in to ${brand.name}`}</Preview>
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
              Sign in to {brand.name}
            </Heading>
            <Text
              className="text-[16px] leading-[24px]"
              style={{ color: emailTheme.foreground }}
            >
              Click the button below to sign in to {brand.name}:
            </Text>
            <Section className="text-center mt-[24px] mb-[24px]">
              <Button
                className="rounded-lg text-[14px] font-medium no-underline text-center px-5 py-3"
                href={url}
                style={{
                  backgroundColor: emailTheme.buttonBackground,
                  border: `1px solid ${emailTheme.buttonBorder}`,
                  color: emailTheme.buttonForeground,
                }}
              >
                Sign in
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
                href={url}
                className="underline rounded-md"
                style={{ color: emailTheme.link }}
              >
                {url}
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
              . If you didn&apos;t try to sign in, you can safely ignore this
              email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
