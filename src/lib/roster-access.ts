import { db } from "@/db";
import { rosterEntry, user } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getPlatformAdminEmails() {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(email: string) {
  return getPlatformAdminEmails().has(normalizeEmail(email));
}

export async function getActiveRosterEntries(email: string) {
  return db
    .select()
    .from(rosterEntry)
    .where(eq(rosterEntry.email, normalizeEmail(email)))
    .orderBy(asc(rosterEntry.createdAt))
    .then((rows) => rows.filter((row) => row.active));
}

export type ActiveRosterEntry = Awaited<
  ReturnType<typeof getActiveRosterEntries>
>[number];

export function selectPrimaryRosterEntry(entries: ActiveRosterEntry[]) {
  return (
    entries.find((entry) => entry.establishmentId !== null) ??
    entries[0] ??
    null
  );
}

export async function getEmailAccess(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const entries = await getActiveRosterEntries(normalizedEmail);
  return {
    normalizedEmail,
    platformAdmin: isPlatformAdminEmail(normalizedEmail),
    entries,
    primaryEntry: selectPrimaryRosterEntry(entries),
    allowed: entries.length > 0 || isPlatformAdminEmail(normalizedEmail),
  };
}

export async function isEmailAllowed(email: string) {
  return (await getEmailAccess(email)).allowed;
}

export async function getUserAccess(userId: string) {
  const records = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const account = records[0];
  if (!account) return null;

  const access = await getEmailAccess(account.email);
  const banIsActive =
    account.banned &&
    (account.banExpires === null || account.banExpires > new Date());

  return {
    account,
    ...access,
    allowed: access.allowed && !banIsActive,
    banIsActive,
  };
}

export async function isUserAllowed(userId: string) {
  return (await getUserAccess(userId))?.allowed === true;
}
