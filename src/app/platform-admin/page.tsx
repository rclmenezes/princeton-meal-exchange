import { AuthButton } from "@/components/auth-button";
import { PlatformUserActions } from "@/components/platform-user-actions";
import { NotificationRetryButton } from "@/components/notification-retry-button";
import { db } from "@/db";
import {
  accessNotification,
  establishment,
  member,
  rosterEntry,
  user,
} from "@/db/schema";
import { getManagementContext } from "@/lib/admin-authorization";
import { isPlatformAdminEmail } from "@/lib/roster-access";
import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await getManagementContext(await headers());
  if (!context?.platformAdmin) redirect("/");
  const query = (await searchParams).q?.trim() ?? "";

  const accounts = await db
    .select()
    .from(user)
    .where(
      query
        ? or(ilike(user.name, `%${query}%`), ilike(user.email, `%${query}%`))
        : undefined,
    )
    .orderBy(asc(user.name))
    .limit(100);
  const userIds = accounts.map((account) => account.id);
  const [rosters, memberships, clubs, failedNotifications] = await Promise.all([
    userIds.length
      ? db
          .select({
            userId: rosterEntry.linkedUserId,
            source: rosterEntry.source,
            role: rosterEntry.role,
            accountType: rosterEntry.accountType,
            establishmentName: establishment.name,
          })
          .from(rosterEntry)
          .leftJoin(
            establishment,
            eq(establishment.id, rosterEntry.establishmentId),
          )
          .where(
            and(
              inArray(rosterEntry.linkedUserId, userIds),
              eq(rosterEntry.active, true),
            ),
          )
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({ userId: member.userId, role: member.role })
          .from(member)
          .where(inArray(member.userId, userIds))
      : Promise.resolve([]),
    db
      .select({
        id: establishment.id,
        name: establishment.name,
        organizationId: establishment.organizationId,
        rosterVersion: establishment.rosterVersion,
        rosterCount: count(rosterEntry.id),
      })
      .from(establishment)
      .leftJoin(
        rosterEntry,
        and(
          eq(rosterEntry.establishmentId, establishment.id),
          eq(rosterEntry.active, true),
        ),
      )
      .where(eq(establishment.type, "eating_club"))
      .groupBy(establishment.id)
      .orderBy(asc(establishment.name)),
    db
      .select({
        id: accessNotification.id,
        email: accessNotification.email,
        errorMessage: accessNotification.errorMessage,
        createdAt: accessNotification.createdAt,
      })
      .from(accessNotification)
      .where(eq(accessNotification.status, "failed"))
      .orderBy(asc(accessNotification.createdAt))
      .limit(20),
  ]);
  const rosterByUser = new Map(
    rosters
      .filter((entry) => entry.userId)
      .map((entry) => [entry.userId as string, entry]),
  );
  const membershipByUser = new Map(
    memberships.map((item) => [item.userId, item.role]),
  );

  return (
    <main className="admin-page">
      <a className="skip-link" href="#platform-content">
        Skip to main content
      </a>
      <header className="admin-header">
        <div>
          <p className="text-sm font-bold tracking-wide text-[var(--accent)] uppercase">
            Website team
          </p>
          <p className="mt-1 text-2xl font-semibold">Platform administration</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Signed in as {context.user.email}
          </p>
        </div>
        <nav
          aria-label="Account views"
          className="flex flex-wrap items-center gap-3"
        >
          <Link className="admin-link-button" href="/">
            Student view
          </Link>
          <AuthButton />
        </nav>
      </header>

      <div className="admin-content" id="platform-content">
        <header>
          <p className="eyebrow">Flow 5</p>
          <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">
            Platform console
          </h1>
          <p className="mt-3 max-w-3xl text-lg leading-8 text-[var(--muted)]">
            Bootstrap club rosters, inspect account access, ban users, and
            revoke sessions. Platform-admin identity remains controlled by
            deployment configuration.
          </p>
        </header>

        <section aria-labelledby="clubs-title" className="admin-panel">
          <h2 className="text-2xl font-semibold" id="clubs-title">
            Eating clubs
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clubs.map((club) => (
              <article
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4"
                key={club.id}
              >
                <h3 className="text-lg font-semibold">{club.name}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {club.organizationId
                    ? "Organization active"
                    : "Setup pending"}{" "}
                  · {Number(club.rosterCount)} roster entries
                </p>
                <Link
                  className="admin-link-button mt-4"
                  href={`/admin?establishment=${club.id}`}
                >
                  {Number(club.rosterCount)
                    ? "Manage club"
                    : "Bootstrap roster"}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="users-title" className="admin-panel">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold" id="users-title">
                Users
              </h2>
              <p className="mt-2 text-[var(--muted)]">
                Up to 100 matching registered accounts.
              </p>
            </div>
            <form className="flex gap-2" method="get">
              <label className="sr-only" htmlFor="user-search">
                Search users
              </label>
              <input
                className="admin-input"
                defaultValue={query}
                id="user-search"
                name="q"
                placeholder="Name or email"
              />
              <button className="admin-link-button" type="submit">
                Search
              </button>
            </form>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="admin-table">
              <caption className="sr-only">
                Registered users and platform account controls
              </caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Roster and role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const roster = rosterByUser.get(account.id);
                  const orgRole = membershipByUser.get(account.id);
                  const protectedAccount =
                    account.id === context.user.id ||
                    isPlatformAdminEmail(account.email);
                  return (
                    <tr key={account.id}>
                      <th scope="row">
                        <span className="block font-semibold">
                          {account.name}
                        </span>
                        <span className="block text-sm font-normal text-[var(--muted)]">
                          {account.email}
                        </span>
                        {roster?.accountType === "shared_meal_checking" ? (
                          <span className="admin-badge mt-1">
                            Shared meal-checking account
                          </span>
                        ) : null}
                      </th>
                      <td>
                        <span className="block">
                          {roster?.establishmentName ??
                            roster?.source ??
                            "No active roster"}
                        </span>
                        <span className="block text-sm text-[var(--muted)] capitalize">
                          {orgRole ?? roster?.role ?? "No organization role"}
                        </span>
                      </td>
                      <td>
                        {account.banned
                          ? "Banned"
                          : protectedAccount
                            ? "Platform admin"
                            : roster
                              ? "Active"
                              : "No active source"}
                        {account.banReason ? (
                          <span className="block text-sm text-[var(--muted)]">
                            {account.banReason}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <PlatformUserActions
                          banned={account.banned}
                          protectedAccount={protectedAccount}
                          userId={account.id}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {failedNotifications.length ? (
          <section aria-labelledby="delivery-title" className="admin-panel">
            <h2 className="text-2xl font-semibold" id="delivery-title">
              Failed access notifications
            </h2>
            <ul className="mt-4 grid gap-3">
              {failedNotifications.map((notification) => (
                <li className="admin-error" key={notification.id}>
                  <span className="font-semibold">{notification.email}</span>
                  <span className="mt-1 block text-sm">
                    {notification.errorMessage ?? "Delivery failed."}
                  </span>
                  <NotificationRetryButton id={notification.id} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
