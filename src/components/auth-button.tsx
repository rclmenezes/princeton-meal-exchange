"use client";

import { authClient } from "@/lib/auth-client";

type AuthButtonProps = {
  callbackURL?: string;
  className?: string;
  signInLabel?: string;
};

export function AuthButton({
  callbackURL = "/",
  className,
  signInLabel = "Sign in with TigerNet",
}: AuthButtonProps = {}) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <button
        className={
          className ??
          "rounded-md border border-black/10 px-4 py-2 text-sm font-medium text-[var(--muted)]"
        }
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
        className={
          className ??
          "rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        }
        onClick={() => void authClient.signOut()}
        type="button"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      className={
        className ??
        "rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
      }
      onClick={() =>
        void authClient.signIn.oauth2({
          providerId: "tigernet",
          callbackURL,
          errorCallbackURL: "/?authError=1",
        })
      }
      type="button"
    >
      {signInLabel}
    </button>
  );
}
