"use client";

import { AuthButton } from "@/components/auth-button";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

export function HomeActions({
  authBypassed = false,
  adminHref,
}: {
  authBypassed?: boolean;
  adminHref?: string | null;
}) {
  if (authBypassed) {
    return (
      <div className="home-actions">
        {adminHref ? (
          <Link className="home-checking-link" href={adminHref}>
            Administration
          </Link>
        ) : null}
        <Link className="home-checking-link" href="/meal-checking">
          Meal checking
        </Link>
        <span className="rounded-full border border-black/20 px-3 py-2 text-xs font-semibold">
          Development auth bypass
        </span>
      </div>
    );
  }

  return <AuthenticatedHomeActions adminHref={adminHref} />;
}

function AuthenticatedHomeActions({
  adminHref,
}: {
  adminHref?: string | null;
}) {
  const { data: session, isPending } = authClient.useSession();

  return (
    <div className="home-actions">
      {!isPending && session ? (
        <>
          {adminHref ? (
            <Link className="home-checking-link" href={adminHref}>
              Administration
            </Link>
          ) : null}
          <Link className="home-checking-link" href="/meal-checking">
            Meal checking
          </Link>
        </>
      ) : null}
      <AuthButton callbackURL="/auth/complete" />
    </div>
  );
}
