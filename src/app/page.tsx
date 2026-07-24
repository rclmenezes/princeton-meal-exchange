import { AuthButton } from "@/components/auth-button";
import { ExchangeForm } from "@/components/exchange-form";
import { db } from "@/db";
import { establishment, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  DEMO_LOCATIONS,
  DEMO_USER,
  isDevelopmentDemoMode,
} from "@/lib/demo-data";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const demoMode = isDevelopmentDemoMode();
  const session = demoMode
    ? { user: DEMO_USER }
    : await auth.api.getSession({ headers: await headers() });
  const [locations, profiles] = session
    ? demoMode
      ? [DEMO_LOCATIONS, [{ eligible: true }]]
      : await Promise.all([
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
            .where(eq(user.id, session.user.id))
            .limit(1),
        ])
    : [[], []];

  return (
    <main className="home-page">
      <a className="skip-link" href="#home-content">
        Skip to main content
      </a>
      <header className="product-header">
        <span className="brand" aria-label="Meal Exchange">
          <span className="brand-tile" aria-hidden="true">
            ME
          </span>
          <span className="brand-name">
            <b>Meal Exchange</b>
            <span>Princeton Dining</span>
          </span>
        </span>
        {demoMode ? (
          <span className="flow1-badge flow1-badge-ok">Local demo</span>
        ) : (
          <AuthButton className="button button-secondary" />
        )}
      </header>

      <div className="home-content" id="home-content">
        {!session ? (
          <section className="flow1-hero">
            <div>
              <p className="eyebrow">One invitation. One shared meal.</p>
              <h1>Make your next meal exchange simple.</h1>
              <p>
                Find another Princeton student, choose when and where you’ll
                eat, and send an invitation in a few steps.
              </p>
              <AuthButton
                className="button button-primary flow1-hero-button"
                signInLabel="Sign in with TigerNet"
              />
              <small>Use your Princeton TigerNet account to continue.</small>
            </div>
            <div aria-hidden="true" className="flow1-hero-art">
              <span>ME</span>
            </div>
          </section>
        ) : (
          <div className="flow1-dashboard">
            <div className="flow1-welcome">
              <div>
                <p className="eyebrow">Student dashboard</p>
                <h1>Hi, {session.user.name.split(" ")[0]}.</h1>
                <p>Plan a meal exchange with another student.</p>
              </div>
              <div
                className={`flow1-badge ${
                  profiles[0]?.eligible ? "flow1-badge-ok" : ""
                }`}
              >
                <span aria-hidden="true">
                  {profiles[0]?.eligible ? "✓" : "!"}
                </span>
                {profiles[0]?.eligible
                  ? "Meal plan eligible"
                  : "Eligibility not confirmed"}
              </div>
            </div>
            {locations.length > 0 ? (
              <ExchangeForm locations={locations} />
            ) : (
              <section className="flow1-card">
                <div className="flow1-card-intro">
                  <p className="eyebrow">Setup required</p>
                  <h2>Host locations are not available yet</h2>
                  <p>Apply the latest database migration to seed locations.</p>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <footer className="product-footer">
        Built by <strong>Hoagie Club</strong> for Princeton students.
      </footer>
    </main>
  );
}
