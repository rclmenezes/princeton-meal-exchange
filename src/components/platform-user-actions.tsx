"use client";

import { Button } from "@/components/ui/button";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

async function errorMessage(response: Response) {
  const data = (await response.json()) as { error?: string };
  return data.error ?? "The account action failed.";
}

export function PlatformUserActions({
  userId,
  banned,
  protectedAccount,
}: {
  userId: string;
  banned: boolean;
  protectedAccount: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function ban(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const duration = String(data.get("duration") ?? "permanent");
    const expiresIn =
      duration === "day"
        ? 60 * 60 * 24
        : duration === "week"
          ? 60 * 60 * 24 * 7
          : duration === "month"
            ? 60 * 60 * 24 * 30
            : null;
    setPending(true);
    setError("");
    const response = await fetch(`/api/platform-admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: data.get("reason"), expiresIn }),
    });
    setPending(false);
    if (!response.ok) return setError(await errorMessage(response));
    setStatus("User banned and active sessions revoked.");
    router.refresh();
  }

  async function action(action: "unban" | "sessions") {
    setPending(true);
    setError("");
    const response = await fetch(
      action === "unban"
        ? `/api/platform-admin/users/${userId}/ban`
        : `/api/platform-admin/users/${userId}/sessions`,
      { method: "DELETE" },
    );
    setPending(false);
    if (!response.ok) return setError(await errorMessage(response));
    setStatus(
      action === "unban" ? "User unbanned." : "All user sessions revoked.",
    );
    router.refresh();
  }

  if (protectedAccount) {
    return (
      <span className="text-sm text-[var(--muted)]">Environment-managed</span>
    );
  }

  return (
    <div className="grid min-w-64 gap-2">
      {banned ? (
        <Button
          disabled={pending}
          onClick={() => void action("unban")}
          size="sm"
          variant="outline"
        >
          Unban user
        </Button>
      ) : (
        <form className="grid gap-2" onSubmit={(event) => void ban(event)}>
          <label className="sr-only" htmlFor={`ban-reason-${userId}`}>
            Ban reason
          </label>
          <div className="flex gap-2">
            <input
              className="admin-input min-w-0"
              id={`ban-reason-${userId}`}
              maxLength={500}
              name="reason"
              placeholder="Reason for ban"
              required
            />
            <Button
              disabled={pending}
              size="sm"
              type="submit"
              variant="outline"
            >
              Ban
            </Button>
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            Ban duration
            <select
              className="admin-input"
              defaultValue="permanent"
              name="duration"
            >
              <option value="permanent">Permanent</option>
              <option value="day">24 hours</option>
              <option value="week">7 days</option>
              <option value="month">30 days</option>
            </select>
          </label>
        </form>
      )}
      <Button
        disabled={pending}
        onClick={() => void action("sessions")}
        size="sm"
        variant="ghost"
      >
        Revoke all sessions
      </Button>
      <div aria-live="polite" className="text-sm">
        {error ? (
          <p className="text-[var(--bad-ink)]" role="alert">
            {error}
          </p>
        ) : (
          status
        )}
      </div>
    </div>
  );
}
