"use client";

import { AuthButton } from "@/components/auth-button";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

export function HomeActions({
  authBypassed = false,
}: {
  authBypassed?: boolean;
}) {
  if (authBypassed) {
    return (
      <div className="home-actions">
        <Link className="home-checking-link" href="/meal-checking">
          Meal checking
        </Link>
        <span className="rounded-full border border-black/20 px-3 py-2 text-xs font-semibold">
          Development auth bypass
        </span>
      </div>
    );
  }

  return <AuthenticatedHomeActions />;
}

function AuthenticatedHomeActions() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <div className="home-actions">
      {!isPending && session ? (
        <Link className="home-checking-link" href="/meal-checking">
          Meal checking
        </Link>
      ) : null}
      <AuthButton />
    </div>
  );
}
