import { hasValidMutationOrigin, writeAdminAudit } from "@/lib/admin-audit";
import {
  canManageOwners,
  canManageRoster,
  getManagementContext,
} from "@/lib/admin-authorization";
import {
  createManualRosterEntry,
  RosterApplyError,
  type ManualRosterInput,
} from "@/lib/roster";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );

  let body: Partial<ManualRosterInput> & { establishmentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body.establishmentId ||
    typeof body.email !== "string" ||
    typeof body.fullName !== "string" ||
    typeof body.role !== "string" ||
    typeof body.exchangeEligible !== "boolean"
  )
    return NextResponse.json(
      { error: "Complete every required field." },
      { status: 400 },
    );

  const context = await getManagementContext(
    request.headers,
    body.establishmentId,
  );
  if (
    !context ||
    !canManageRoster(context) ||
    context.establishmentId !== body.establishmentId ||
    (body.role === "owner" && !canManageOwners(context))
  )
    return NextResponse.json({ error: "Roster not found." }, { status: 404 });

  try {
    const created = await createManualRosterEntry(body.establishmentId, {
      email: body.email,
      fullName: body.fullName,
      role: body.role as ManualRosterInput["role"],
      exchangeEligible: body.exchangeEligible,
      studentId: body.studentId,
      classYear: body.classYear,
      accountType: body.accountType,
    });
    await writeAdminAudit(
      {
        userId: context.user.id,
        sessionId: context.sessionId,
        organizationId: context.organizationId,
        establishmentId: body.establishmentId,
      },
      "roster.entry_created",
      "roster_entry",
      created?.id ?? null,
      request,
      { email: body.email.toLowerCase(), role: body.role },
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof RosterApplyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("Manual roster creation failed", error);
    return NextResponse.json(
      { error: "The roster entry could not be added." },
      { status: 500 },
    );
  }
}
