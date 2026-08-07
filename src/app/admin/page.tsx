import { AuthButton } from "@/components/auth-button";
import { RosterManager } from "@/components/roster-manager";
import { db } from "@/db";
import { establishment, exchange, rosterEntry } from "@/db/schema";
import {
  canManageOwners,
  canManageRoster,
  getManagementContext,
  getPendingOrganizationEntry,
} from "@/lib/admin-authorization";
import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function princetonDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ establishment?: string; page?: string }>;
}) {
  const parameters = await searchParams;
  const requestHeaders = await headers();
  const context = await getManagementContext(
    requestHeaders,
    parameters.establishment,
  );
  if (!context) {
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-3xl place-items-center px-5 py-10">
        <section
          className="admin-panel w-full"
          aria-labelledby="admin-sign-in-title"
        >
          <h1 className="text-3xl font-semibold" id="admin-sign-in-title">
            Administration sign-in
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            Use the same TigerNet or email sign-in as the student experience.
          </p>
          <div className="mt-6">
            <AuthButton callbackURL="/auth/complete" />
          </div>
        </section>
      </main>
    );
  }
  if (!context.establishmentId || !canManageRoster(context)) {
    const pending = await getPendingOrganizationEntry(context.user.id);
    if (pending && pending.role !== "member") redirect("/organization-pending");
    if (context.platformAdmin) redirect("/platform-admin");
    redirect("/");
  }

  const clubRows = await db
    .select({
      id: establishment.id,
      name: establishment.name,
      organizationId: establishment.organizationId,
      rosterVersion: establishment.rosterVersion,
    })
    .from(establishment)
    .where(eq(establishment.id, context.establishmentId))
    .limit(1);
  const club = clubRows[0];
  if (!club) redirect("/");

  const page = Math.max(1, Number(parameters.page) || 1);
  const pageSize = 25;
  const today = princetonDate();
  const [
    roster,
    rosterCount,
    upcomingCount,
    completedCount,
    upcoming,
    completed,
  ] = await Promise.all([
    db
      .select({
        id: rosterEntry.id,
        email: rosterEntry.email,
        fullName: rosterEntry.fullName,
        role: rosterEntry.role,
        accountType: rosterEntry.accountType,
        exchangeEligible: rosterEntry.exchangeEligible,
        studentId: rosterEntry.studentId,
        classYear: rosterEntry.classYear,
        linkedUserId: rosterEntry.linkedUserId,
      })
      .from(rosterEntry)
      .where(
        and(
          eq(rosterEntry.establishmentId, club.id),
          eq(rosterEntry.active, true),
        ),
      )
      .orderBy(asc(rosterEntry.fullName)),
    db
      .select({ value: count() })
      .from(rosterEntry)
      .where(
        and(
          eq(rosterEntry.establishmentId, club.id),
          eq(rosterEntry.active, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(exchange)
      .where(
        and(
          eq(exchange.establishmentId, club.id),
          inArray(exchange.status, ["pending", "accepted"]),
          gte(exchange.exchangeDate, today),
        ),
      ),
    db
      .select({ value: count() })
      .from(exchange)
      .where(
        and(
          eq(exchange.establishmentId, club.id),
          eq(exchange.status, "completed"),
        ),
      ),
    db.query.exchange.findMany({
      where: and(
        eq(exchange.establishmentId, club.id),
        inArray(exchange.status, ["pending", "accepted"]),
        gte(exchange.exchangeDate, today),
      ),
      with: {
        mealGuestUser: { columns: { name: true } },
        mealHostUser: { columns: { name: true } },
      },
      orderBy: [asc(exchange.exchangeDate), asc(exchange.mealType)],
      limit: 50,
    }),
    db.query.exchange.findMany({
      where: and(
        eq(exchange.establishmentId, club.id),
        eq(exchange.status, "completed"),
      ),
      with: {
        mealGuestUser: { columns: { name: true } },
        mealHostUser: { columns: { name: true } },
      },
      orderBy: [desc(exchange.completedAt), desc(exchange.exchangeDate)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  ]);
  const completedTotal = Number(completedCount[0]?.value ?? 0);
  const pageCount = Math.max(1, Math.ceil(completedTotal / pageSize));

  return (
    <main className="admin-page">
      <a className="skip-link" href="#admin-content">
        Skip to main content
      </a>
      <header className="admin-header">
        <div>
          <p className="text-sm font-bold tracking-wide text-[var(--accent)] uppercase">
            Eating-club administration
          </p>
          <p className="mt-1 text-2xl font-semibold">{club.name}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Signed in as {context.user.name} ·{" "}
            {context.platformAdmin
              ? "Platform admin"
              : context.organizationRole}
          </p>
        </div>
        <nav
          aria-label="Account views"
          className="flex flex-wrap items-center gap-3"
        >
          {context.platformAdmin ? (
            <Link className="admin-link-button" href="/platform-admin">
              Platform console
            </Link>
          ) : null}
          <Link className="admin-link-button" href="/">
            Student view
          </Link>
          <AuthButton />
        </nav>
      </header>

      <div className="admin-content" id="admin-content">
        <header>
          <p className="eyebrow">Flow 5</p>
          <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">
            Club dashboard
          </h1>
          <p className="mt-3 max-w-3xl text-lg leading-8 text-[var(--muted)]">
            Review venue exchanges and keep the roster that controls account and
            organization access current.
          </p>
        </header>

        <dl className="admin-stat-grid">
          <Stat
            label="Active roster"
            value={Number(rosterCount[0]?.value ?? 0)}
          />
          <Stat
            label="Upcoming exchanges"
            value={Number(upcomingCount[0]?.value ?? 0)}
          />
          <Stat label="Completed exchanges" value={completedTotal} />
        </dl>

        <ExchangeTable
          title="Upcoming exchanges"
          rows={upcoming}
          empty="No upcoming exchanges at this establishment."
        />
        <ExchangeTable
          title="Completed exchanges"
          rows={completed}
          empty="No completed exchanges at this establishment."
        />
        {pageCount > 1 ? (
          <nav
            aria-label="Completed exchange pages"
            className="flex items-center gap-3"
          >
            {page > 1 ? (
              <Link
                className="admin-link-button"
                href={`/admin?page=${page - 1}${context.platformAdmin ? `&establishment=${club.id}` : ""}`}
              >
                Previous
              </Link>
            ) : null}
            <span>
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                className="admin-link-button"
                href={`/admin?page=${page + 1}${context.platformAdmin ? `&establishment=${club.id}` : ""}`}
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}

        <RosterManager
          canManageOwners={canManageOwners(context)}
          entries={roster}
          establishmentId={club.id}
        />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type ExchangeRow = Awaited<
  ReturnType<typeof db.query.exchange.findMany>
>[number] & {
  mealGuestUser?: { name: string } | null;
  mealHostUser?: { name: string } | null;
};

function ExchangeTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: ExchangeRow[];
  empty: string;
}) {
  return (
    <section
      className="admin-panel"
      aria-labelledby={`${title.replaceAll(" ", "-").toLowerCase()}-title`}
    >
      <h2
        className="text-2xl font-semibold"
        id={`${title.replaceAll(" ", "-").toLowerCase()}-title`}
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-[var(--muted)]">{empty}</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="admin-table">
            <caption className="sr-only">{title} at this establishment</caption>
            <thead>
              <tr>
                <th scope="col">Guest</th>
                <th scope="col">Host member</th>
                <th scope="col">Meal</th>
                <th scope="col">Date</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    {row.mealGuestUser?.name ?? row.counterpartName}
                  </th>
                  <td>{row.mealHostUser?.name ?? row.hostName}</td>
                  <td className="capitalize">{row.mealType}</td>
                  <td>{row.exchangeDate}</td>
                  <td className="capitalize">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
