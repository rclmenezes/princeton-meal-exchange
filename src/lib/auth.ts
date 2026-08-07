import { db } from "@/db";
import { establishment, user as databaseUser } from "@/db/schema";
import * as schema from "@/db/schema";
import { writeAdminAudit } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email";
import {
  getEmailAccess,
  getUserAccess,
  isEmailAllowed,
} from "@/lib/roster-access";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { createAccessControl } from "better-auth/plugins/access";
import { admin } from "better-auth/plugins/admin";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { magicLink } from "better-auth/plugins/magic-link";
import { organization } from "better-auth/plugins/organization";
import { eq } from "drizzle-orm";

const platformAdminStatements = {
  user: ["list", "get", "ban"],
  session: ["list", "revoke"],
} as const;
const platformAdminAccess = createAccessControl(platformAdminStatements);
const platformAdminRole = platformAdminAccess.newRole({
  user: ["list", "get", "ban"],
  session: ["list", "revoke"],
});
const platformUserRole = platformAdminAccess.newRole({ user: [], session: [] });

const rosterOrganizationStatements = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const;
const rosterOrganizationAccess = createAccessControl(
  rosterOrganizationStatements,
);
const noDirectOrganizationMutations = rosterOrganizationAccess.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
});

const authSecret = process.env.BETTER_AUTH_SECRET;
const tigerNetIssuerUrl = process.env.TIGERNET_ISSUER_URL?.replace(/\/+$/, "");
const tigerNetConfigured = Boolean(
  process.env.TIGERNET_CLIENT_ID &&
  process.env.TIGERNET_CLIENT_SECRET &&
  tigerNetIssuerUrl,
);
const vercelPreviewHost =
  process.env.VERCEL_ENV === "preview"
    ? (process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL)
    : undefined;
const authBaseUrl = vercelPreviewHost
  ? `https://${vercelPreviewHost}`
  : (process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000");

if (!authSecret && process.env.VERCEL === "1") {
  throw new Error("BETTER_AUTH_SECRET must be set in Vercel.");
}

export const auth = betterAuth({
  appName: "Princeton Meal Exchange",
  baseURL: authBaseUrl,
  secret: authSecret ?? "development-only-princeton-meal-exchange-secret",
  trustedOrigins: ["https://meal.exchange", "https://*.vercel.app"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  user: {
    additionalFields: {
      accountType: {
        type: ["person", "shared_meal_checking"],
        required: false,
        defaultValue: "person",
        input: false,
      },
      studentId: { type: "string", required: false, input: false },
      graphId: { type: "string", required: false, input: false },
      planCode: { type: "string", required: false, input: false },
      isExchangeEligible: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      classYear: { type: "number", required: false, input: false },
      homeEstablishmentId: {
        type: "string",
        required: false,
        input: false,
      },
      eligibilityUpdatedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  account: {
    encryptOAuthTokens: true,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/magic-link": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const access = await getEmailAccess(data.email);
          if (!access.allowed) return false;

          const primary = access.primaryEntry;
          return {
            data: {
              ...data,
              email: access.normalizedEmail,
              name: primary?.fullName ?? data.name,
              role: access.platformAdmin ? "admin" : "user",
              accountType: primary?.accountType ?? "person",
              studentId: primary?.studentId ?? null,
              classYear: primary?.classYear ?? null,
              homeEstablishmentId: primary?.establishmentId ?? null,
              isExchangeEligible: access.entries.some(
                (entry) => entry.exchangeEligible,
              ),
              eligibilityUpdatedAt: new Date(),
            },
          };
        },
      },
      delete: {
        before: async () => false,
      },
    },
    session: {
      create: {
        before: async (data) => {
          const access = await getUserAccess(data.userId);
          if (!access?.allowed) return false;

          const establishmentId = access.primaryEntry?.establishmentId;
          const club = establishmentId
            ? await db
                .select({ organizationId: establishment.organizationId })
                .from(establishment)
                .where(eq(establishment.id, establishmentId))
                .limit(1)
            : [];
          return {
            data: {
              ...data,
              activeOrganizationId: club[0]?.organizationId ?? null,
            },
          };
        },
        after: async (data, context) => {
          const access = await getUserAccess(data.userId);
          const primary = access?.primaryEntry;
          await writeAdminAudit(
            {
              userId: data.userId,
              sessionId: data.id,
              establishmentId: primary?.establishmentId,
            },
            "session.created",
            "session",
            data.id,
            context?.request,
            { sharedAccount: primary?.accountType === "shared_meal_checking" },
          );
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (!context.path.startsWith("/admin/")) return;
      const current = await getSessionFromCtx(context);
      if (
        !current ||
        current.user.role !== "admin" ||
        !(await getEmailAccess(current.user.email)).platformAdmin
      ) {
        throw new APIError("FORBIDDEN");
      }
      const targetUserId =
        typeof context.body === "object" &&
        context.body !== null &&
        "userId" in context.body &&
        typeof context.body.userId === "string"
          ? context.body.userId
          : null;
      if (targetUserId && targetUserId !== current.user.id) {
        const targets = await db
          .select({ email: databaseUser.email })
          .from(databaseUser)
          .where(eq(databaseUser.id, targetUserId))
          .limit(1);
        if (
          targets[0] &&
          (await getEmailAccess(targets[0].email)).platformAdmin
        ) {
          throw new APIError("FORBIDDEN");
        }
      }
    }),
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
  plugins: [
    magicLink({
      storeToken: "hashed",
      sendMagicLink: async ({ email, token, url }) => {
        if (!(await isEmailAllowed(email))) return;

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
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      ac: platformAdminAccess,
      roles: {
        admin: platformAdminRole,
        user: platformUserRole,
      },
    }),
    organization({
      allowUserToCreateOrganization: false,
      disableOrganizationDeletion: true,
      invitationLimit: 0,
      ac: rosterOrganizationAccess,
      roles: {
        owner: noDirectOrganizationMutations,
        admin: noDirectOrganizationMutations,
        member: noDirectOrganizationMutations,
      },
      organizationHooks: {
        beforeCreateInvitation: async () => {
          throw new Error("Organization invitations are disabled.");
        },
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
