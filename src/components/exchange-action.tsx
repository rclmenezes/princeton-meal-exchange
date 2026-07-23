"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ExchangeActionProps = {
  token: string;
  accepted: boolean;
  confirmationEmailFailed: boolean;
};

export function ExchangeAction({
  token,
  accepted,
  confirmationEmailFailed,
}: ExchangeActionProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = accepted ? "Retry confirmation email" : "Accept exchange";

  async function submit() {
    setIsPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/exchanges/${encodeURIComponent(token)}/accept`,
        { method: "POST" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error ?? "Something went wrong. Please try again.",
        );
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

  if (accepted && !confirmationEmailFailed) return null;

  return (
    <div className="exchange-action">
      <button
        className="button button-primary button-block"
        disabled={isPending}
        onClick={() => void submit()}
        type="button"
      >
        {isPending ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {accepted ? "Sending…" : "Accepting…"}
          </>
        ) : (
          <>
            {label}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d={
                  accepted
                    ? "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"
                    : "M5 12.5l4.5 4.5L19 7.5"
                }
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
