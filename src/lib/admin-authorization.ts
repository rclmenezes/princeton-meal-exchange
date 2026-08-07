import { db } from "@/db";
import { establishment, member, rosterEntry, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  DEVELOPMENT_AUTH_SESSION_ID,
  DEVELOPMENT_AUTH_USER,
  ensureDevelopmentAuthUser,
  isDevelopmentAuthBypassEnabled,
  isDevelopmentOrganizationAdminBypassEnabled,
  isDevelopmentPlatformAdminBypassEnabled,
} from "@/lib/auth-context";
import { getUserAccess, isPlatformAdminEmail } from "@/lib/roster-access";
import { and, eq } from "drizzle-orm";

export type ManagementContext = {
  user: typeof user.$inferSelect;
  sessionId: string;
  platformAdmin: boolean;
  establishmentId: string | null;
  organizationId: string | null;
  organizationRole: "owner" | "admin" | "member" | null;
};

export async function getManagementContext(
  requestHeaders: Headers,
  preferredEstablishmentId?: string | null,
): Promise<ManagementContext | null> {
  if (isDevelopmentAuthBypassEnabled()) {
    if (
      !isDevelopmentOrganizationAdminBypassEnabled() &&
      !isDevelopmentPlatformAdminBypassEnabled()
    ) {
      return null;
    }

    await ensureDevelopmentAuthUser();
    const accounts = await db
      .select()
      .from(user)
      .where(eq(user.id, DEVELOPMENT_AUTH_USER.id))
      .limit(1);
    const account = accounts[0];
    if (!account) return null;

    const platformAdmin = isDevelopmentPlatformAdminBypassEnabled();
    if (platformAdmin && preferredEstablishmentId) {
      const clubs = await db
        .select({
          establishmentId: establishment.id,
          organizationId: establishment.organizationId,
        })
        .from(establishment)
        .where(
          and(
            eq(establishment.id, preferredEstablishmentId),
            eq(establishment.type, "eating_club"),
          ),
        )
        .limit(1);
      if (!clubs[0]) return null;
      return {
        user: account,
        sessionId: DEVELOPMENT_AUTH_SESSION_ID,
        platformAdmin: true,
        establishmentId: clubs[0].establishmentId,
        organizationId: clubs[0].organizationId,
        organizationRole: null,
      };
    }

    const memberships = isDevelopmentOrganizationAdminBypassEnabled()
      ? await db
          .select({
            establishmentId: establishment.id,
            organizationId: establishment.organizationId,
          })
          .from(member)
          .innerJoin(
            establishment,
            eq(establishment.organizationId, member.organizationId),
          )
          .where(
            preferredEstablishmentId
              ? and(
                  eq(member.userId, account.id),
                  eq(establishment.id, preferredEstablishmentId),
                )
              : eq(member.userId, account.id),
          )
          .limit(1)
      : [];
    const membership = memberships[0];

    return {
      user: account,
      sessionId: DEVELOPMENT_AUTH_SESSION_ID,
      platformAdmin,
      establishmentId: membership?.establishmentId ?? null,
      organizationId: membership?.organizationId ?? null,
      organizationRole: membership ? "admin" : null,
    };
  }

  const authSession = await auth.api.getSession({ headers: requestHeaders });
  if (!authSession) return null;

  const access = await getUserAccess(authSession.user.id);
  if (!access?.allowed) return null;

  const platformAdmin =
    access.account.role === "admin" &&
    isPlatformAdminEmail(access.account.email);

  if (platformAdmin && preferredEstablishmentId) {
    const clubs = await db
      .select({
        establishmentId: establishment.id,
        organizationId: establishment.organizationId,
      })
      .from(establishment)
      .where(
        and(
          eq(establishment.id, preferredEstablishmentId),
          eq(establishment.type, "eating_club"),
        ),
      )
      .limit(1);
    if (!clubs[0]) return null;
    return {
      user: access.account,
      sessionId: authSession.session.id,
      platformAdmin: true,
      establishmentId: clubs[0].establishmentId,
      organizationId: clubs[0].organizationId,
      organizationRole: null,
    };
  }

  const memberships = await db
    .select({
      establishmentId: establishment.id,
      organizationId: establishment.organizationId,
      role: member.role,
    })
    .from(member)
    .innerJoin(
      establishment,
      eq(establishment.organizationId, member.organizationId),
    )
    .where(eq(member.userId, access.account.id))
    .limit(1);
  const membership = memberships[0];
  const organizationRole =
    membership?.role === "owner" ||
    membership?.role === "admin" ||
    membership?.role === "member"
      ? membership.role
      : null;

  return {
    user: access.account,
    sessionId: authSession.session.id,
    platformAdmin,
    establishmentId: membership?.establishmentId ?? null,
    organizationId: membership?.organizationId ?? null,
    organizationRole,
  };
}

export async function getPendingOrganizationEntry(userId: string) {
  return db
    .select({
      role: rosterEntry.role,
      establishmentId: rosterEntry.establishmentId,
      establishmentName: establishment.name,
      organizationId: establishment.organizationId,
    })
    .from(rosterEntry)
    .innerJoin(establishment, eq(establishment.id, rosterEntry.establishmentId))
    .where(
      and(eq(rosterEntry.linkedUserId, userId), eq(rosterEntry.active, true)),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export function canManageRoster(context: ManagementContext) {
  return (
    context.platformAdmin ||
    context.organizationRole === "owner" ||
    context.organizationRole === "admin"
  );
}

export function canManageOwners(context: ManagementContext) {
  return context.platformAdmin || context.organizationRole === "owner";
}
