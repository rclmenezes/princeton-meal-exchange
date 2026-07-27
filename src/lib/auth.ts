import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink } from "better-auth/plugins";

const authSecret = process.env.BETTER_AUTH_SECRET;
const tigerNetIssuerUrl = process.env.TIGERNET_ISSUER_URL?.replace(/\/+$/, "");
const tigerNetConfigured = Boolean(
  process.env.TIGERNET_CLIENT_ID &&
  process.env.TIGERNET_CLIENT_SECRET &&
  tigerNetIssuerUrl,
);

if (!authSecret && process.env.VERCEL === "1") {
  throw new Error("BETTER_AUTH_SECRET must be set in Vercel.");
}

export const auth = betterAuth({
  appName: "Princeton Meal Exchange",
  baseURL:
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000",
  secret: authSecret ?? "development-only-princeton-meal-exchange-secret",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Verify your Princeton Meal Exchange email",
        text: `Click the link to verify your email: ${url}`,
      });
    },
  },
  plugins: [
    magicLink({
      storeToken: "hashed",
      sendMagicLink: async ({ email, token, url }) => {
        if (!process.env.RESEND_API_KEY) {
          throw new Error("RESEND_API_KEY must be set to send sign-in links.");
        }

        await sendEmail({
          to: email,
          subject: "Sign in to Princeton Meal Exchange",
          text: [
            "Use this secure link to sign in to Princeton Meal Exchange:",
            "",
            url,
            "",
            "This link expires in 5 minutes and can only be used once.",
            "If you did not request this email, you can ignore it.",
          ].join("\n"),
          idempotencyKey: `magic-link/${token}`,
        });
      },
    }),
    ...(tigerNetConfigured && process.env.NODE_ENV === "production"
      ? [
          genericOAuth({
            config: [
              {
                providerId: "tigernet",
                clientId: process.env.TIGERNET_CLIENT_ID!,
                clientSecret: process.env.TIGERNET_CLIENT_SECRET!,
                issuer: tigerNetIssuerUrl!,
                discoveryUrl: `${tigerNetIssuerUrl!}/.well-known/openid-configuration`,
                scopes: ["openid", "profile", "email"],
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});
