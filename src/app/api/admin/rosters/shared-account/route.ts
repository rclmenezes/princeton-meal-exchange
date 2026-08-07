import { hasValidMutationOrigin, writeAdminAudit } from "@/lib/admin-audit";
import {
  canManageRoster,
  getManagementContext,
} from "@/lib/admin-authorization";
import { replaceSharedAccount, RosterApplyError } from "@/lib/roster";
import { NextResponse } from "next/server";

export async function PUT(request: Request) {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  let body: { establishmentId?: string; email?: string; fullName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.establishmentId || !body.email || !body.fullName)
    return NextResponse.json(
      { error: "Email and display name are required." },
      { status: 400 },
    );
  const context = await getManagementContext(
    request.headers,
    body.establishmentId,
  );
  if (
    !context ||
    !canManageRoster(context) ||
    context.establishmentId !== body.establishmentId
  )
    return NextResponse.json({ error: "Roster not found." }, { status: 404 });
  try {
    const created = await replaceSharedAccount(body.establishmentId, {
      email: body.email,
      fullName: body.fullName,
    });
    await writeAdminAudit(
      {
        userId: context.user.id,
        sessionId: context.sessionId,
        organizationId: context.organizationId,
        establishmentId: body.establishmentId,
      },
      "roster.shared_account_replaced",
      "roster_entry",
      created.id ?? null,
      request,
      { email: body.email.toLowerCase() },
    );
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof RosterApplyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("Shared-account replacement failed", error);
    return NextResponse.json(
      { error: "The shared account could not be replaced." },
      { status: 500 },
    );
  }
}
