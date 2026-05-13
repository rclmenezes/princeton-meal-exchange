import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

const authSecret = process.env.BETTER_AUTH_SECRET;

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
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Verify your Princeton Meal Exchange email",
        text: `Click the link to verify your email: ${url}`,
      });
    },
  },
  plugins: [nextCookies()],
});
