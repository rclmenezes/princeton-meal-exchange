"use client";

import { AuthButton } from "@/components/auth-button";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

export function HomeActions() {
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
