"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormEvent, useEffect, useRef, useState } from "react";

type AuthButtonProps = {
  callbackURL?: string;
  className?: string;
  signInLabel?: string;
};

export function AuthButton({
  callbackURL = "/",
  className,
  signInLabel = "Sign in",
}: AuthButtonProps = {}) {
  const { data: session, isPending } = authClient.useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const [tigerNetPending, setTigerNetPending] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  const triggerButtonProps = className
    ? ({ className, size: "unstyled", variant: "unstyled" } as const)
    : ({ size: "sm", variant: "primary" } as const);

  function showToast(message: string) {
    setToast(message);
    if (toastTimeout.current) {
      clearTimeout(toastTimeout.current);
    }
    toastTimeout.current = setTimeout(() => setToast(""), 4500);
  }

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    emailInput.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDialogOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen]);

  useEffect(
    () => () => {
      if (toastTimeout.current) {
        clearTimeout(toastTimeout.current);
      }
    },
    [],
  );

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailStatus("sending");
    setEmailMessage("");

    try {
      const normalizedEmail = email.trim();
      const { error } = await authClient.signIn.magicLink({
        email: normalizedEmail,
        name: normalizedEmail.split("@")[0],
        callbackURL,
      });

      if (error) {
        setEmailStatus("error");
        setEmailMessage(
          error.message ??
            "We could not send a sign-in link. Please try again.",
        );
        return;
      }

      setEmailStatus("sent");
      setEmailMessage(`We sent a secure sign-in link to ${normalizedEmail}.`);
    } catch {
      setEmailStatus("error");
      setEmailMessage("We could not send a sign-in link. Please try again.");
    }
  }

  async function handleTigerNetSignIn() {
    if (process.env.NODE_ENV !== "production") {
      showToast("TigerNet SSO is unavailable in local development.");
      return;
    }

    setTigerNetPending(true);
    try {
      const { error } = await authClient.signIn.oauth2({
        providerId: "tigernet",
        callbackURL,
      });

      if (error) {
        setTigerNetPending(false);
        showToast(
          error.message ?? "TigerNet sign-in is unavailable. Please try again.",
        );
      }
    } catch {
      setTigerNetPending(false);
      showToast("TigerNet sign-in is unavailable. Please try again.");
    }
  }

  async function handleSignOut() {
    setSignOutPending(true);
    try {
      await authClient.signOut();
    } finally {
      setSignOutPending(false);
    }
  }

  if (isPending) {
    return (
      <Button {...triggerButtonProps} disabled>
        Loading…
      </Button>
    );
  }

  if (session) {
    return (
      <Button
        {...triggerButtonProps}
        disabled={signOutPending}
        onClick={() => void handleSignOut()}
      >
        {signOutPending ? "Logging out…" : "Log out"}
      </Button>
    );
  }

  return (
    <>
      <Button
        {...triggerButtonProps}
        onClick={() => {
          setDialogOpen(true);
          setEmailStatus("idle");
          setEmailMessage("");
        }}
      >
        {signInLabel}
      </Button>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button
            aria-label="Close sign-in dialog"
            className="absolute inset-0 cursor-default bg-black/45"
            onClick={() => setDialogOpen(false)}
            type="button"
          />
          <section
            aria-labelledby="sign-in-title"
            aria-modal="true"
            className="relative w-full max-w-md rounded-xl border border-black/20 bg-[var(--surface)] p-6 shadow-2xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
                  Princeton Meal Exchange
                </p>
                <h2 className="mt-1 text-2xl font-semibold" id="sign-in-title">
                  Sign in
                </h2>
              </div>
              <Button
                aria-label="Close sign-in dialog"
                onClick={() => setDialogOpen(false)}
                size="icon"
                variant="ghost"
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  ×
                </span>
              </Button>
            </div>

            <Button
              className="mt-6 w-full"
              disabled={tigerNetPending}
              onClick={() => void handleTigerNetSignIn()}
              size="lg"
            >
              {tigerNetPending
                ? "Connecting to TigerNet…"
                : "Continue with Princeton TigerNet"}
            </Button>

            <div className="my-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              <span className="h-px flex-1 bg-black/15" />
              or use email
              <span className="h-px flex-1 bg-black/15" />
            </div>

            {emailStatus === "sent" ? (
              <div
                className="rounded-md border border-[var(--ok-edge)] bg-[var(--ok-tint)] p-4 text-sm text-[var(--ok-ink)]"
                role="status"
              >
                <p className="font-semibold">Check your inbox</p>
                <p className="mt-1">{emailMessage}</p>
              </div>
            ) : (
              <form onSubmit={(event) => void handleEmailSignIn(event)}>
                <label
                  className="text-sm font-semibold"
                  htmlFor="sign-in-email"
                >
                  Email address
                </label>
                <input
                  autoComplete="email"
                  className="mt-2 w-full rounded-md border border-black/25 bg-white px-3 py-3 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-glow)]"
                  id="sign-in-email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@princeton.edu"
                  ref={emailInput}
                  required
                  type="email"
                  value={email}
                />
                {emailStatus === "error" ? (
                  <p
                    className="mt-2 text-sm text-[var(--bad-ink)]"
                    role="alert"
                  >
                    {emailMessage}
                  </p>
                ) : null}
                <Button
                  className="mt-3 w-full"
                  disabled={emailStatus === "sending"}
                  size="lg"
                  type="submit"
                  variant="outline"
                >
                  {emailStatus === "sending"
                    ? "Sending sign-in link…"
                    : "Email me a sign-in link"}
                </Button>
              </form>
            )}

            <p className="mt-5 text-xs leading-5 text-[var(--muted)]">
              Email links expire after five minutes and can only be used once.
            </p>
          </section>
        </div>
      ) : null}

      {toast ? (
        <div
          className="fixed right-4 bottom-4 z-[60] max-w-sm rounded-md bg-black px-4 py-3 text-sm font-medium text-white shadow-xl"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
