"use client";

import { authClient } from "@/lib/auth-client";

export function AuthButton() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <button
        className="rounded-md border border-black/10 px-4 py-2 text-sm font-medium text-[var(--muted)]"
        disabled
        type="button"
      >
        Loading
      </button>
    );
  }

  if (session) {
    return (
      <button
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        onClick={() => void authClient.signOut()}
        type="button"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
      onClick={() =>
        void authClient.signIn.social({
          provider: "google",
          callbackURL: "/",
        })
      }
      type="button"
    >
      Sign in with Google
    </button>
  );
}
