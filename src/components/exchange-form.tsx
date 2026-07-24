"use client";

import { princetonDateString, type MealType } from "@/lib/exchange";
import { FormEvent, useEffect, useId, useRef, useState } from "react";

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

export function ExchangeForm({ locations }: { locations: Location[] }) {
  const searchId = useId();
  const listboxId = useId();
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
    mealType: string;
    date: string;
  } | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (selected || query.trim().length < 2) return;

    const timeout = window.setTimeout(async () => {
      searchRequest.current?.abort();
      const controller = new AbortController();
      searchRequest.current = controller;
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

    return () => window.clearTimeout(timeout);
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
          mealType: string;
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
    <section aria-labelledby="create-exchange-title" className="flow1-card">
      <div className="flow1-card-intro">
        <p className="eyebrow">New exchange</p>
        <h2 id="create-exchange-title">Invite someone to share a meal</h2>
        <p>
          We’ll verify both meal plans before sending the invitation. The other
          student will have seven days to accept.
        </p>
      </div>

      {success ? (
        <div className="flow1-success" role="status">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Invitation sent to {success.counterpartName}</strong>
            <p>
              {success.mealType === "lunch" ? "Lunch" : "Dinner"} at{" "}
              {success.locationName} on{" "}
              {new Intl.DateTimeFormat("en-US", {
                dateStyle: "long",
                timeZone: "UTC",
              }).format(new Date(`${success.date}T12:00:00Z`))}
              .
            </p>
          </div>
        </div>
      ) : null}

      <form onSubmit={submit}>
        <div className="flow1-field flow1-search">
          <label htmlFor={searchId}>Who are you exchanging with?</label>
          <p className="flow1-hint" id={`${searchId}-hint`}>
            Search the Princeton directory by name.
          </p>
          <input
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-describedby={`${searchId}-hint`}
            aria-expanded={
              !selected && query.trim().length >= 2 && results.length > 0
            }
            autoComplete="off"
            id={searchId}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
              setResults([]);
              setIsSearching(false);
            }}
            placeholder="Start typing a name"
            role="combobox"
            value={selected ? `${selected.name} (${selected.email})` : query}
          />
          <div className="flow1-search-status" role="status">
            {isSearching ? "Searching…" : searchError}
          </div>
          {!selected && query.trim().length >= 2 && !isSearching ? (
            <ul
              aria-label="Student search results"
              className="flow1-results"
              id={listboxId}
              role="listbox"
            >
              {results.length === 0 && !searchError ? (
                <li className="flow1-empty">No students found.</li>
              ) : (
                results.map((student) => (
                  <li
                    aria-disabled={!student.eligible}
                    aria-selected="false"
                    key={student.id}
                    role="option"
                  >
                    <button
                      disabled={!student.eligible}
                      onClick={() => {
                        setSelected(student);
                        setResults([]);
                      }}
                      type="button"
                    >
                      <span>
                        <strong>{student.name}</strong>
                        <small>{student.email}</small>
                      </span>
                      <small
                        className={
                          student.eligible
                            ? "flow1-eligible"
                            : "flow1-ineligible"
                        }
                      >
                        {student.eligibilityMessage}
                      </small>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
          {selected ? (
            <button
              className="flow1-change"
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              type="button"
            >
              Choose someone else
            </button>
          ) : null}
        </div>

        <fieldset className="flow1-fieldset">
          <legend>Meal</legend>
          <div className="flow1-meals">
            {(["lunch", "dinner"] as const).map((option) => (
              <label key={option}>
                <input
                  checked={mealType === option}
                  name="mealType"
                  onChange={() => setMealType(option)}
                  type="radio"
                  value={option}
                />
                <span>{option === "lunch" ? "Lunch" : "Dinner"}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flow1-grid">
          <div className="flow1-field">
            <label htmlFor="exchange-date">Date</label>
            <input
              id="exchange-date"
              min={princetonDateString()}
              onChange={(event) => setDate(event.target.value)}
              required
              type="date"
              value={date}
            />
          </div>
          <div className="flow1-field">
            <label htmlFor="host-location">Host location</label>
            <select
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
          <p className="flow1-error" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          className="button button-primary flow1-submit"
          disabled={isSubmitting || !selected}
          type="submit"
        >
          {isSubmitting ? "Checking eligibility…" : "Send invitation"}
        </button>
      </form>
    </section>
  );
}
