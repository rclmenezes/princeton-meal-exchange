import { ExchangeForm } from "@/components/exchange-form";
import { HomeActions } from "@/components/home-actions";
import { db } from "@/db";
import { establishment, user } from "@/db/schema";
import { ensureDevelopmentAuthUser, getAuthContext } from "@/lib/auth-context";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authContext = await getAuthContext(await headers());
  if (authContext.authBypassed) await ensureDevelopmentAuthUser();
  const currentUser = authContext.user;
  const [locations, profile] = currentUser
    ? await Promise.all([
        db
          .select({
            id: establishment.id,
            name: establishment.name,
            type: establishment.type,
          })
          .from(establishment)
          .where(eq(establishment.isActive, true))
          .orderBy(asc(establishment.type), asc(establishment.name)),
        db
          .select({ eligible: user.isExchangeEligible })
          .from(user)
          .where(eq(user.id, currentUser.id))
          .limit(1),
      ])
    : [[], []];
  const eligible = profile[0]?.eligible === true;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <a className="skip-link" href="#home-content">
        Skip to main content
      </a>
      <nav className="flex items-center justify-between gap-4 border-b border-black/10 pb-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-[var(--muted)] uppercase">
            Princeton
          </p>
          <p className="text-2xl font-semibold">Meal Exchange</p>
        </div>
        <HomeActions authBypassed={authContext.authBypassed} />
      </nav>

      <div className="flex-1 py-10 sm:py-14" id="home-content">
        {!currentUser ? (
          <section className="grid min-h-[60vh] place-items-center">
            <div className="max-w-2xl">
              <p className="mb-4 text-sm font-medium tracking-wide text-[var(--accent)] uppercase">
                One invitation. One shared meal.
              </p>
              <h1 className="text-4xl font-semibold tracking-normal sm:text-6xl">
                Share meals with less coordination overhead.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
                Sign in with a secure email link or Princeton TigerNet to find
                another eligible student and plan an exchange.
              </p>
            </div>
          </section>
        ) : (
          <div className="grid gap-7">
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
                  Student dashboard
                </p>
                <h1 className="mt-1 text-4xl font-semibold">
                  Hi, {currentUser.name.split(" ")[0]}.
                </h1>
                <p className="mt-2 text-[var(--muted)]">
                  Plan a meal exchange with another student.
                </p>
              </div>
              <p
                className={`w-fit rounded-full border px-4 py-2 text-sm font-semibold ${
                  eligible
                    ? "border-[var(--ok-edge)] bg-[var(--ok-tint)] text-[var(--ok-ink)]"
                    : "border-[var(--bad-edge)] bg-[var(--bad-tint)] text-[var(--bad-ink)]"
                }`}
              >
                {eligible
                  ? "✓ Meal plan eligible"
                  : "! Eligibility not confirmed"}
              </p>
            </header>

            {!eligible ? (
              <section
                aria-labelledby="eligibility-title"
                className="rounded-xl border border-[var(--bad-edge)] bg-[var(--bad-tint)] p-6"
              >
                <h2 className="text-xl font-semibold" id="eligibility-title">
                  You cannot create an exchange yet.
                </h2>
                <p className="mt-2 max-w-2xl leading-7">
                  Your account is signed in, but Flow 4 has not confirmed an
                  eligible meal plan in the latest roster.
                </p>
              </section>
            ) : locations.length > 0 ? (
              <ExchangeForm locations={locations} />
            ) : (
              <section className="rounded-xl border border-black/15 bg-[var(--surface)] p-6">
                <h2 className="text-xl font-semibold">
                  Host locations are unavailable.
                </h2>
                <p className="mt-2 text-[var(--muted)]">
                  Apply the latest database migration to seed establishments.
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
