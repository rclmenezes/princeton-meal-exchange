"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function NotificationRetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function retry() {
    setPending(true);
    setMessage("");
    const response = await fetch(
      `/api/platform-admin/notifications/${id}/retry`,
      { method: "POST" },
    );
    const data = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) return setMessage(data.error ?? "Delivery failed again.");
    router.refresh();
  }
  return (
    <div className="mt-3">
      <Button
        disabled={pending}
        onClick={() => void retry()}
        size="sm"
        variant="outline"
      >
        {pending ? "Retrying…" : "Retry delivery"}
      </Button>
      <div aria-live="polite" className="mt-2 text-sm">
        {message}
      </div>
    </div>
  );
}
