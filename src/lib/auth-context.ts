export type AppUser = {
  id: string;
  name: string;
  email: string;
};

export const DEVELOPMENT_AUTH_USER = {
  id: "development-auth-bypass-user",
  name: "Local Developer",
  email: "development-auth-bypass@localhost.invalid",
} satisfies AppUser;

export const DEVELOPMENT_COUNTERPARTS = [
  {
    id: "development-cottage-member",
    name: "Maya Hernandez",
    email: "maya.development@localhost.invalid",
    planCode: "eating-club",
    isExchangeEligible: true,
    homeEstablishmentName: "Cottage Club",
  },
  {
    id: "development-ineligible-student",
    name: "Taylor Morgan",
    email: "taylor.development@localhost.invalid",
    planCode: "block-32",
    isExchangeEligible: false,
    homeEstablishmentName: null,
  },
] as const;

// The bypass is deliberately limited to `next dev`. Tests and production
// continue to exercise the real authentication boundary by default.
export function isDevelopmentAuthBypassEnabled(
  nodeEnv = process.env.NODE_ENV,
  configuredValue = process.env.DEV_BYPASS_AUTH,
) {
  return nodeEnv === "development" && configuredValue === "true";
}

export async function getAuthContext(requestHeaders: Headers): Promise<{
  user: AppUser | null;
  authBypassed: boolean;
}> {
  if (isDevelopmentAuthBypassEnabled()) {
    return { user: DEVELOPMENT_AUTH_USER, authBypassed: true };
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { user: null, authBypassed: false };
  if (process.env.NODE_ENV === "production") {
    const { isUserAllowed } = await import("@/lib/roster-access");
    if (!(await isUserAllowed(session.user.id))) {
      return { user: null, authBypassed: false };
    }
  }
  return { user: session.user, authBypassed: false };
}

// Persist local-only roster fixtures before foreign-key-backed development
// flows. This remains outside committed application behavior.
export async function ensureDevelopmentAuthUser() {
  if (!isDevelopmentAuthBypassEnabled()) {
    return;
  }

  const [{ db }, { establishment, user }, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);

  const cottage = await db
    .select({ id: establishment.id })
    .from(establishment)
    .where(eq(establishment.name, "Cottage Club"))
    .limit(1);
  if (!cottage[0]) {
    throw new Error(
      "The Cottage Club development fixture requires the establishment seed migration.",
    );
  }
  const eligibilityUpdatedAt = new Date();

  await db
    .insert(user)
    .values([
      {
        ...DEVELOPMENT_AUTH_USER,
        emailVerified: true,
        planCode: "unlimited",
        isExchangeEligible: true,
        eligibilityUpdatedAt,
      },
      ...DEVELOPMENT_COUNTERPARTS.map((fixture) => {
        const { homeEstablishmentName, ...values } = fixture;
        return {
          ...values,
          emailVerified: true,
          homeEstablishmentId:
            homeEstablishmentName === "Cottage Club" ? cottage[0].id : null,
          eligibilityUpdatedAt,
        };
      }),
    ])
    .onConflictDoNothing();
}
