"use client";

import { Button } from "@/components/ui/button";
import { princetonDateString, type MealType } from "@/lib/exchange";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

type Student = {
  id: string;
  name: string;
  email: string;
  eligible: boolean;
  eligibilityMessage: string;
};

type Location = {
  id: string;
  name: string;
  type: "dining_hall" | "eating_club";
};

export function ExchangeForm({
  locations,
}: {
  locations: readonly Location[];
}) {
  const searchId = useId();
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [date, setDate] = useState("");
  const [establishmentId, setEstablishmentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState<{
    counterpartName: string;
    locationName: string;
    mealType: MealType;
    date: string;
  } | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");
      try {
        const response = await fetch(
          `/api/students/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as {
          students?: Student[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Search failed.");
        setResults(body.students ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSearchError(
            error instanceof Error ? error.message : "Search failed.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, selected]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccess(null);
    if (!selected) {
      setFormError("Choose an eligible student from the search results.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/exchanges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          counterpartId: selected.id,
          establishmentId,
          mealType,
          date,
        }),
      });
      const body = (await response.json()) as {
        exchange?: {
          counterpartName: string;
          locationName: string;
          mealType: MealType;
          date: string;
        };
        error?: string;
      };
      if (!response.ok || !body.exchange) {
        throw new Error(body.error ?? "The exchange could not be created.");
      }

      setSuccess(body.exchange);
      setQuery("");
      setSelected(null);
      setResults([]);
      setIsSearching(false);
      setDate("");
      setEstablishmentId("");
      idempotencyKey.current = crypto.randomUUID();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "The exchange could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="create-exchange-title"
      className="rounded-xl border border-black/15 bg-[var(--surface)] p-5 shadow-sm sm:p-7"
    >
      <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
        New exchange
      </p>
      <h2 className="mt-1 text-2xl font-semibold" id="create-exchange-title">
        Invite someone to share a meal
      </h2>
      <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
        Both meal plans will be checked before the invitation is sent.
      </p>

      {success ? (
        <div
          className="mt-5 rounded-lg border border-[var(--ok-edge)] bg-[var(--ok-tint)] p-4 text-[var(--ok-ink)]"
          role="status"
        >
          <p className="font-semibold">
            Invitation sent to {success.counterpartName}
          </p>
          <p className="mt-1 text-sm">
            {capitalize(success.mealType)} at {success.locationName} on{" "}
            {formatMealDate(success.date)}.
          </p>
        </div>
      ) : null}

      <form className="mt-6 grid gap-6" onSubmit={submit}>
        <div>
          <label className="font-semibold" htmlFor={searchId}>
            Who are you exchanging with?
          </label>
          <p
            className="mt-1 text-sm text-[var(--muted)]"
            id={`${searchId}-hint`}
          >
            Search the current eligibility roster by name or email.
          </p>
          <input
            aria-describedby={`${searchId}-hint ${searchId}-status`}
            aria-controls={resultsId}
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-black/25 bg-white px-3 py-3 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-glow)]"
            id={searchId}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
              setResults([]);
              setIsSearching(false);
              setSearchError("");
            }}
            placeholder="Start typing a name or email"
            value={selected ? `${selected.name} (${selected.email})` : query}
          />
          <p
            className="mt-2 min-h-5 text-sm text-[var(--muted)]"
            id={`${searchId}-status`}
            role="status"
          >
            {isSearching ? "Searching…" : searchError}
          </p>

          {!selected && query.trim().length >= 2 && !isSearching ? (
            <ul
              aria-label="Student search results"
              className="mt-1 grid gap-2"
              id={resultsId}
            >
              {results.length === 0 && !searchError ? (
                <li className="rounded-lg border border-black/15 p-3 text-sm text-[var(--muted)]">
                  No students found.
                </li>
              ) : (
                results.map((student) => (
                  <li key={student.id}>
                    <button
                      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-lg border border-black/20 bg-white px-4 py-3 text-left disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:opacity-75"
                      disabled={!student.eligible}
                      onClick={() => {
                        setSelected(student);
                        setResults([]);
                        setIsSearching(false);
                      }}
                      type="button"
                    >
                      <span>
                        <strong className="block">{student.name}</strong>
                        <span className="block text-sm text-[var(--muted)]">
                          {student.email}
                        </span>
                      </span>
                      <span className="text-sm font-semibold">
                        {student.eligibilityMessage}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}

          {selected ? (
            <button
              className="mt-2 min-h-11 font-semibold underline underline-offset-4"
              onClick={() => {
                setSelected(null);
                setQuery("");
                setResults([]);
                setIsSearching(false);
              }}
              type="button"
            >
              Choose someone else
            </button>
          ) : null}
        </div>

        <fieldset>
          <legend className="font-semibold">Meal</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {(["lunch", "dinner"] as const).map((option) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-black/20 bg-white px-4 py-2"
                key={option}
              >
                <input
                  checked={mealType === option}
                  name="mealType"
                  onChange={() => setMealType(option)}
                  type="radio"
                  value={option}
                />
                <span>{capitalize(option)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="font-semibold" htmlFor="exchange-date">
              Date
            </label>
            <input
              className="mt-2 min-h-12 w-full rounded-lg border border-black/25 bg-white px-3 py-2"
              id="exchange-date"
              min={princetonDateString()}
              onChange={(event) => setDate(event.target.value)}
              required
              type="date"
              value={date}
            />
          </div>
          <div>
            <label className="font-semibold" htmlFor="host-location">
              Host location
            </label>
            <select
              className="mt-2 min-h-12 w-full rounded-lg border border-black/25 bg-white px-3 py-2"
              id="host-location"
              onChange={(event) => setEstablishmentId(event.target.value)}
              required
              value={establishmentId}
            >
              <option value="">Choose a location</option>
              <optgroup label="Dining halls">
                {locations
                  .filter((location) => location.type === "dining_hall")
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Eating clubs">
                {locations
                  .filter((location) => location.type === "eating_club")
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
        </div>

        {formError ? (
          <p
            className="rounded-lg border border-[var(--bad-edge)] bg-[var(--bad-tint)] p-4 text-[var(--bad-ink)]"
            role="alert"
          >
            {formError}
          </p>
        ) : null}

        <Button
          className="w-full sm:w-auto"
          disabled={isSubmitting || !selected}
          size="lg"
          type="submit"
        >
          {isSubmitting ? "Checking eligibility…" : "Send invitation"}
        </Button>
      </form>
    </section>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMealDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
