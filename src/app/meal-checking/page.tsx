import { AuthButton } from "@/components/auth-button";
import { MealChecker } from "@/components/meal-checker";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Meal checking · Princeton Meal Exchange",
  description: "Scan and validate a guest’s meal exchange door pass.",
};

export default async function MealCheckingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  // TODO(flow-5): Replace this authenticated-user guard with an admin-role
  // and establishment authorization check.
  if (!session) {
    return (
      <main className="meal-checking-page">
        <section className="checker-state-card" aria-labelledby="sign-in-title">
          <p className="eyebrow">Meal checking</p>
          <h1 id="sign-in-title">Sign in to check in guests.</h1>
          <p className="muted">
            Use your Princeton account to start a meal-checking session.
          </p>
          <AuthButton
            callbackURL="/meal-checking"
            className="button button-primary"
            signInLabel="Sign in with Princeton NetID"
          />
        </section>
      </main>
    );
  }

  return <MealChecker checkerName={session.user.name} />;
}
