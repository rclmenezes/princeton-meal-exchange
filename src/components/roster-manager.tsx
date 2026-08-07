"use client";

import { Button } from "@/components/ui/button";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RosterEntryView = {
  id: string;
  email: string;
  fullName: string;
  role: "owner" | "admin" | "member";
  accountType: "person" | "shared_meal_checking";
  exchangeEligible: boolean;
  studentId: string | null;
  classYear: number | null;
  linkedUserId: string | null;
};

type Preview = {
  checksum: string;
  rosterVersion: number;
  counts: {
    total: number;
    additions: number;
    updates: number;
    removals: number;
  };
  errors: Array<{ row: number | null; field: string | null; message: string }>;
  warnings: string[];
  diff: {
    additions: Array<{ email: string; fullName: string }>;
    updates: Array<{ email: string; fullName: string }>;
    removals: Array<{ email: string; fullName: string }>;
  };
};

async function responseJson(response: Response) {
  return (await response.json()) as { error?: string };
}

export function RosterManager({
  establishmentId,
  entries,
  canManageOwners,
}: {
  establishmentId: string;
  entries: RosterEntryView[];
  canManageOwners: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function previewFile(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;
    setPending(true);
    setError("");
    setStatus("Validating roster…");
    try {
      const body = new FormData();
      body.set("file", selectedFile);
      body.set("establishmentId", establishmentId);
      const response = await fetch("/api/admin/rosters/preview", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as Preview & { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "The roster could not be previewed.");
      setPreview(data);
      setStatus(
        data.errors.length
          ? `Preview found ${data.errors.length} validation error${data.errors.length === 1 ? "" : "s"}.`
          : `Preview ready for ${data.counts.total} roster entries.`,
      );
    } catch (caught) {
      setPreview(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "The roster could not be previewed.",
      );
      setStatus("");
    } finally {
      setPending(false);
    }
  }

  async function applyFile() {
    if (!selectedFile || !preview || preview.errors.length > 0) return;
    setPending(true);
    setError("");
    setStatus("Applying roster…");
    try {
      const body = new FormData();
      body.set("file", selectedFile);
      body.set("establishmentId", establishmentId);
      body.set("checksum", preview.checksum);
      body.set("rosterVersion", String(preview.rosterVersion));
      const response = await fetch("/api/admin/rosters/apply", {
        method: "POST",
        body,
      });
      const data = await responseJson(response);
      if (!response.ok)
        throw new Error(data.error ?? "The roster could not be applied.");
      setPreview(null);
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Roster applied successfully.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The roster could not be applied.",
      );
      setStatus("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="upload-title" className="admin-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold" id="upload-title">
              Replace roster from CSV
            </h2>
            <p className="mt-2 max-w-3xl text-[var(--muted)]">
              Preview validates the entire file before any account access
              changes.
            </p>
          </div>
          <a
            className="admin-link-button"
            download
            href="/api/admin/rosters/template"
          >
            Download CSV template
          </a>
        </div>
        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => void previewFile(event)}
        >
          <div>
            <label className="admin-label" htmlFor="roster-file">
              Roster CSV
            </label>
            <input
              accept=".csv,text/csv"
              className="admin-input"
              id="roster-file"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setError("");
                setStatus("");
              }}
              ref={fileInput}
              required
              type="file"
            />
            <p className="mt-2 text-sm text-[var(--muted)]">
              UTF-8 CSV, maximum 2 MB. Required columns: email, full_name, role,
              exchange_eligible.
            </p>
          </div>
          <Button
            className="w-fit"
            disabled={!selectedFile || pending}
            type="submit"
          >
            {pending ? "Working…" : "Preview roster changes"}
          </Button>
        </form>

        <div aria-live="polite" className="mt-4 min-h-6 text-sm font-semibold">
          {status}
        </div>
        {error ? (
          <div className="admin-error" role="alert">
            {error}
          </div>
        ) : null}

        {preview ? (
          <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <h3 className="text-lg font-semibold">Preview summary</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewCount label="Total" value={preview.counts.total} />
              <PreviewCount label="Add" value={preview.counts.additions} />
              <PreviewCount label="Update" value={preview.counts.updates} />
              <PreviewCount
                label="Deactivate"
                value={preview.counts.removals}
              />
            </dl>
            {preview.warnings.length ? (
              <ul className="admin-warning mt-4" role="status">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {preview.errors.length ? (
              <div className="admin-error mt-4" role="alert">
                <p className="font-bold">
                  Correct these errors and preview again:
                </p>
                <ul className="mt-2 list-disc pl-6">
                  {preview.errors.map((item, index) => (
                    <li key={`${item.row}-${item.field}-${index}`}>
                      {item.row ? `Row ${item.row}: ` : ""}
                      {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Button
                className="mt-5"
                disabled={pending}
                onClick={() => void applyFile()}
              >
                Apply these roster changes
              </Button>
            )}
          </div>
        ) : null}
      </section>

      <ManualEntryForm
        canManageOwners={canManageOwners}
        establishmentId={establishmentId}
      />
      <SharedAccountForm establishmentId={establishmentId} entries={entries} />
      {canManageOwners ? (
        <OwnerTransfer establishmentId={establishmentId} entries={entries} />
      ) : null}

      <section aria-labelledby="roster-table-title" className="admin-panel">
        <h2 className="text-2xl font-semibold" id="roster-table-title">
          Active roster
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          {entries.length} active {entries.length === 1 ? "entry" : "entries"}.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="admin-table">
            <caption className="sr-only">
              Active club roster and access roles
            </caption>
            <thead>
              <tr>
                <th scope="col">Person or account</th>
                <th scope="col">Role</th>
                <th scope="col">Exchange access</th>
                <th scope="col">Registration</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <RosterRow
                  canManageOwners={canManageOwners}
                  entry={entry}
                  establishmentId={establishmentId}
                  key={entry.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-bold tracking-wide text-[var(--muted)] uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function ManualEntryForm({
  establishmentId,
  canManageOwners,
}: {
  establishmentId: string;
  canManageOwners: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setMessage("");
    const classYearValue = String(data.get("classYear") ?? "").trim();
    const response = await fetch("/api/admin/rosters/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        establishmentId,
        email: data.get("email"),
        fullName: data.get("fullName"),
        role: data.get("role"),
        exchangeEligible: data.get("exchangeEligible") === "on",
        studentId: data.get("studentId"),
        classYear: classYearValue ? Number(classYearValue) : null,
        accountType: "person",
      }),
    });
    const result = await responseJson(response);
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "The roster entry could not be added.");
      return;
    }
    formRef.current?.reset();
    setMessage("Roster entry added.");
    router.refresh();
  }

  return (
    <section aria-labelledby="manual-add-title" className="admin-panel">
      <h2 className="text-2xl font-semibold" id="manual-add-title">
        Add one person
      </h2>
      <form
        className="admin-form-grid mt-5"
        onSubmit={(event) => void submit(event)}
        ref={formRef}
      >
        <Field label="Email" name="email" required type="email" />
        <Field label="Full name" name="fullName" required />
        <label className="grid gap-2 text-sm font-bold">
          Organization role
          <select className="admin-input" defaultValue="member" name="role">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            {canManageOwners ? (
              <option value="owner">Owner (initial setup only)</option>
            ) : null}
          </select>
        </label>
        <Field label="Student ID (optional)" name="studentId" />
        <Field
          label="Class year (optional)"
          max="2100"
          min="2000"
          name="classYear"
          type="number"
        />
        <label className="flex min-h-12 items-center gap-3 self-end rounded-lg border border-[var(--border)] px-3 py-2 font-semibold">
          <input className="size-5" name="exchangeEligible" type="checkbox" />
          Exchange-eligible
        </label>
        <div className="sm:col-span-2">
          <Button disabled={pending} type="submit">
            {pending ? "Adding…" : "Add roster entry"}
          </Button>
        </div>
      </form>
      <Status error={error} message={message} />
    </section>
  );
}

function SharedAccountForm({
  establishmentId,
  entries,
}: {
  establishmentId: string;
  entries: RosterEntryView[];
}) {
  const router = useRouter();
  const current = entries.find(
    (entry) => entry.accountType === "shared_meal_checking",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const response = await fetch("/api/admin/rosters/shared-account", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        establishmentId,
        email: data.get("email"),
        fullName: data.get("fullName"),
      }),
    });
    const result = await responseJson(response);
    setPending(false);
    if (!response.ok)
      return setError(
        result.error ?? "The shared account could not be changed.",
      );
    setMessage(
      "Shared meal-checking account updated. Existing sessions for the prior account were revoked.",
    );
    router.refresh();
  }
  return (
    <section aria-labelledby="shared-account-title" className="admin-panel">
      <h2 className="text-2xl font-semibold" id="shared-account-title">
        Shared meal-checking account
      </h2>
      <p className="mt-2 max-w-3xl text-[var(--muted)]">
        This club-controlled mailbox has organization admin permissions. Audit
        records identify the shared account and session, not the individual
        operator.
      </p>
      {current ? (
        <p className="mt-3 font-semibold">Current account: {current.email}</p>
      ) : null}
      <form
        className="admin-form-grid mt-5"
        onSubmit={(event) => void submit(event)}
      >
        <Field
          label={current ? "Replacement email" : "Shared email"}
          name="email"
          required
          type="email"
        />
        <Field
          defaultValue={`${current?.fullName ?? ""}`}
          label="Display name"
          name="fullName"
          required
        />
        <div className="sm:col-span-2">
          <Button disabled={pending} type="submit">
            {pending
              ? "Saving…"
              : current
                ? "Replace shared account"
                : "Create shared account"}
          </Button>
        </div>
      </form>
      <Status error={error} message={message} />
    </section>
  );
}

function OwnerTransfer({
  establishmentId,
  entries,
}: {
  establishmentId: string;
  entries: RosterEntryView[];
}) {
  const router = useRouter();
  const candidates = entries.filter(
    (entry) =>
      entry.role !== "owner" &&
      entry.linkedUserId &&
      entry.accountType !== "shared_meal_checking",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (candidates.length === 0) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const response = await fetch("/api/admin/rosters/owner-transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        establishmentId,
        targetEntryId: data.get("targetEntryId"),
      }),
    });
    const result = await responseJson(response);
    setPending(false);
    if (!response.ok)
      return setError(result.error ?? "Ownership could not be transferred.");
    setMessage("Ownership transferred.");
    router.refresh();
  }
  return (
    <section aria-labelledby="owner-transfer-title" className="admin-panel">
      <h2 className="text-2xl font-semibold" id="owner-transfer-title">
        Transfer ownership
      </h2>
      <p className="mt-2 text-[var(--muted)]">
        The new owner must already have registered and signed in.
      </p>
      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => void submit(event)}
      >
        <label className="grid min-w-64 gap-2 text-sm font-bold">
          New owner
          <select className="admin-input" name="targetEntryId" required>
            {candidates.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.fullName} ({entry.email})
              </option>
            ))}
          </select>
        </label>
        <Button disabled={pending} type="submit">
          {pending ? "Transferring…" : "Transfer ownership"}
        </Button>
      </form>
      <Status error={error} message={message} />
    </section>
  );
}

function RosterRow({
  entry,
  establishmentId,
  canManageOwners,
}: {
  entry: RosterEntryView;
  establishmentId: string;
  canManageOwners: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const protectedOwner = entry.role === "owner";
  const sharedAccount = entry.accountType === "shared_meal_checking";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const classYearValue = String(data.get("classYear") ?? "").trim();
    setPending(true);
    setError("");
    const response = await fetch(`/api/admin/rosters/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        establishmentId,
        fullName: data.get("fullName"),
        role: data.get("role"),
        exchangeEligible: data.get("exchangeEligible") === "on",
        studentId: data.get("studentId"),
        classYear: classYearValue ? Number(classYearValue) : null,
      }),
    });
    const result = await responseJson(response);
    setPending(false);
    if (!response.ok)
      return setError(result.error ?? "The entry could not be updated.");
    setEditing(false);
    router.refresh();
  }
  async function deactivate() {
    if (!window.confirm(`Deactivate roster access for ${entry.fullName}?`))
      return;
    setPending(true);
    const response = await fetch(`/api/admin/rosters/entries/${entry.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ establishmentId }),
    });
    const result = await responseJson(response);
    setPending(false);
    if (!response.ok)
      return setError(result.error ?? "The entry could not be deactivated.");
    router.refresh();
  }
  return (
    <tr>
      <th scope="row">
        <span className="block font-semibold">{entry.fullName}</span>
        <span className="block text-sm font-normal text-[var(--muted)]">
          {entry.email}
        </span>
        {entry.accountType === "shared_meal_checking" ? (
          <span className="admin-badge mt-1">Shared meal-checking account</span>
        ) : null}
      </th>
      <td className="capitalize">{entry.role}</td>
      <td>{entry.exchangeEligible ? "Eligible" : "Not eligible"}</td>
      <td>{entry.linkedUserId ? "Registered" : "Not registered"}</td>
      <td>
        {editing ? (
          <form
            className="grid min-w-72 gap-3"
            onSubmit={(event) => void save(event)}
          >
            <label className="grid gap-1 text-sm font-bold">
              Full name
              <input
                className="admin-input"
                defaultValue={entry.fullName}
                name="fullName"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Role
              <select
                className="admin-input"
                defaultValue={entry.role}
                name="role"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Student ID
              <input
                className="admin-input"
                defaultValue={entry.studentId ?? ""}
                name="studentId"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Class year
              <input
                className="admin-input"
                defaultValue={entry.classYear ?? ""}
                max="2100"
                min="2000"
                name="classYear"
                type="number"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 font-semibold">
              <input
                className="size-5"
                defaultChecked={entry.exchangeEligible}
                name="exchangeEligible"
                type="checkbox"
              />
              Exchange-eligible
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} size="sm" type="submit">
                Save
              </Button>
              <Button
                disabled={pending}
                onClick={() => setEditing(false)}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : protectedOwner ? (
          <span className="text-sm text-[var(--muted)]">
            Use ownership controls
          </span>
        ) : sharedAccount ? (
          <span className="text-sm text-[var(--muted)]">
            Use shared-account controls
          </span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => setEditing(true)}
              size="sm"
              variant="outline"
            >
              Edit
            </Button>
            <Button
              disabled={pending || (!canManageOwners && entry.role === "owner")}
              onClick={() => void deactivate()}
              size="sm"
              variant="ghost"
            >
              {pending ? "Working…" : "Deactivate"}
            </Button>
          </div>
        )}
        {error ? (
          <p
            className="mt-2 max-w-xs text-sm text-[var(--bad-ink)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function Field({
  label,
  name,
  ...input
}: {
  label: string;
  name: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      {label}
      <input className="admin-input" name={name} {...input} />
    </label>
  );
}

function Status({ error, message }: { error: string; message: string }) {
  return (
    <div aria-live="polite" className="mt-4 min-h-6 text-sm font-semibold">
      {error ? (
        <p className="text-[var(--bad-ink)]" role="alert">
          {error}
        </p>
      ) : (
        message
      )}
    </div>
  );
}
