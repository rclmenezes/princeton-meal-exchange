import { AuthButton } from "@/components/auth-button";
import {
  getManagementContext,
  getPendingOrganizationEntry,
} from "@/lib/admin-authorization";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrganizationPendingPage() {
  const requestHeaders = await headers();
  const context = await getManagementContext(requestHeaders);
  if (!context) redirect("/");
  if (context.platformAdmin) redirect("/platform-admin");
  if (
    context.organizationRole === "owner" ||
    context.organizationRole === "admin"
  )
    redirect("/admin");

  const pending = await getPendingOrganizationEntry(context.user.id);
  if (!pending || pending.role === "member") redirect("/");

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-3xl place-items-center px-5 py-10">
      <section
        aria-labelledby="pending-title"
        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)] sm:p-10"
      >
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          {pending.establishmentName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold" id="pending-title">
          Organization setup is pending
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-[var(--muted)]">
          Your roster grants administrative access, but the club organization is
          created only after a designated owner signs in. Your access will be
          provisioned automatically after that first owner login.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 font-bold"
            href="/"
          >
            Return to student view
          </Link>
          <AuthButton signInLabel="Sign in again" />
        </div>
      </section>
    </main>
  );
}
