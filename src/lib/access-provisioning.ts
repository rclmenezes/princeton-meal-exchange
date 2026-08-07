import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  establishment,
  member,
  organization,
  rosterEntry,
  session,
  user,
} from "@/db/schema";
import { getUserAccess, normalizeEmail } from "@/lib/roster-access";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

export type AccessDestination =
  | "platform-admin"
  | "organization-admin"
  | "organization-pending"
  | "member"
  | "denied";

function organizationSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function synchronizeUserAccess(
  userId: string,
): Promise<{ destination: AccessDestination; organizationCreated: boolean }> {
  const access = await getUserAccess(userId);
  if (!access?.allowed) {
    await db.transaction(async (tx) => {
      await tx.delete(member).where(eq(member.userId, userId));
      await tx.delete(session).where(eq(session.userId, userId));
      await tx
        .update(user)
        .set({
          role: "user",
          isExchangeEligible: false,
          homeEstablishmentId: null,
          eligibilityUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));
    });
    return { destination: "denied", organizationCreated: false };
  }

  const primary = access.primaryEntry;
  const organizationEntry = access.entries.find(
    (entry) => entry.establishmentId !== null,
  );
  let organizationCreated = false;
  let destination: AccessDestination = access.platformAdmin
    ? "platform-admin"
    : organizationEntry?.role === "owner" || organizationEntry?.role === "admin"
      ? "organization-pending"
      : "member";
  let provisionedEstablishmentId: string | null = null;

  await db.transaction(async (tx) => {
    let organizationId: string | null = null;

    if (organizationEntry?.establishmentId) {
      provisionedEstablishmentId = organizationEntry.establishmentId;
      await tx.execute(
        sql`select ${establishment.id} from ${establishment} where ${establishment.id} = ${organizationEntry.establishmentId} for update`,
      );
      const clubs = await tx
        .select({
          id: establishment.id,
          name: establishment.name,
          organizationId: establishment.organizationId,
        })
        .from(establishment)
        .where(eq(establishment.id, organizationEntry.establishmentId))
        .limit(1);
      const club = clubs[0];
      if (!club) throw new Error("Roster establishment was not found.");

      organizationId = club.organizationId;
      if (!organizationId && organizationEntry.role === "owner") {
        organizationId = randomUUID();
        await tx.insert(organization).values({
          id: organizationId,
          name: club.name,
          slug: organizationSlug(club.name),
          metadata: JSON.stringify({ establishmentId: club.id }),
        });
        await tx
          .update(establishment)
          .set({ organizationId })
          .where(eq(establishment.id, club.id));
        organizationCreated = true;
      }

      if (organizationId) {
        await tx
          .insert(member)
          .values({
            id: randomUUID(),
            organizationId,
            userId,
            role: organizationEntry.role,
          })
          .onConflictDoUpdate({
            target: [member.organizationId, member.userId],
            set: { role: organizationEntry.role },
          });
        await tx
          .delete(member)
          .where(
            and(
              eq(member.userId, userId),
              ne(member.organizationId, organizationId),
            ),
          );
        await tx
          .update(session)
          .set({ activeOrganizationId: organizationId })
          .where(eq(session.userId, userId));

        if (!access.platformAdmin) {
          destination =
            organizationEntry.role === "member"
              ? "member"
              : "organization-admin";
        }
      } else {
        await tx.delete(member).where(eq(member.userId, userId));
        await tx
          .update(session)
          .set({ activeOrganizationId: null })
          .where(eq(session.userId, userId));
      }
    } else {
      await tx.delete(member).where(eq(member.userId, userId));
      await tx
        .update(session)
        .set({ activeOrganizationId: null })
        .where(eq(session.userId, userId));
    }

    await tx
      .update(user)
      .set({
        name: primary?.fullName ?? access.account.name,
        email: access.normalizedEmail,
        role: access.platformAdmin ? "admin" : "user",
        accountType: primary?.accountType ?? "person",
        studentId: primary?.studentId ?? null,
        classYear: primary?.classYear ?? null,
        homeEstablishmentId: organizationEntry?.establishmentId ?? null,
        isExchangeEligible: access.entries.some(
          (entry) => entry.exchangeEligible,
        ),
        eligibilityUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    await tx
      .update(rosterEntry)
      .set({ linkedUserId: userId, updatedAt: new Date() })
      .where(
        and(
          eq(rosterEntry.email, access.normalizedEmail),
          eq(rosterEntry.active, true),
        ),
      );
  });

  if (organizationCreated && provisionedEstablishmentId) {
    await provisionRegisteredClubUsers(provisionedEstablishmentId, userId);
  }

  return { destination, organizationCreated };
}

export async function provisionRegisteredClubUsers(
  establishmentId: string,
  excludeUserId?: string,
) {
  const entries = await db
    .select({ email: rosterEntry.email })
    .from(rosterEntry)
    .where(
      and(
        eq(rosterEntry.establishmentId, establishmentId),
        eq(rosterEntry.active, true),
      ),
    );
  if (entries.length === 0) return;

  const emails = entries.map((entry) => entry.email);
  const accounts = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.email, emails));
  for (const account of accounts) {
    if (account.id !== excludeUserId) {
      await synchronizeUserAccess(account.id);
    }
  }
}

export async function synchronizeUsersByEmail(emails: string[]) {
  const normalized = [...new Set(emails.map(normalizeEmail))];
  if (normalized.length === 0) return;
  const accounts = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.email, normalized));
  for (const account of accounts) await synchronizeUserAccess(account.id);
}
