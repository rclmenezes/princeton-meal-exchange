import { hasValidMutationOrigin, writeAdminAudit } from "@/lib/admin-audit";
import {
  canManageRoster,
  getManagementContext,
} from "@/lib/admin-authorization";
import {
  deactivateManualRosterEntry,
  RosterApplyError,
  updateManualRosterEntry,
} from "@/lib/roster";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return mutateEntry(request, context, false);
}

export async function DELETE(request: Request, context: RouteContext) {
  return mutateEntry(request, context, true);
}

async function mutateEntry(
  request: Request,
  routeContext: RouteContext,
  deactivate: boolean,
) {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const establishmentId = body.establishmentId;
  if (typeof establishmentId !== "string")
    return NextResponse.json(
      { error: "Eating club is required." },
      { status: 400 },
    );

  const management = await getManagementContext(
    request.headers,
    establishmentId,
  );
  if (
    !management ||
    !canManageRoster(management) ||
    management.establishmentId !== establishmentId
  )
    return NextResponse.json({ error: "Roster not found." }, { status: 404 });

  const { id } = await routeContext.params;
  try {
    if (deactivate) {
      await deactivateManualRosterEntry(establishmentId, id);
    } else {
      if (
        typeof body.fullName !== "string" ||
        typeof body.role !== "string" ||
        typeof body.exchangeEligible !== "boolean"
      )
        return NextResponse.json(
          { error: "Complete every required field." },
          { status: 400 },
        );
      await updateManualRosterEntry(establishmentId, id, {
        fullName: body.fullName,
        role: body.role as "owner" | "admin" | "member",
        exchangeEligible: body.exchangeEligible,
        studentId: typeof body.studentId === "string" ? body.studentId : null,
        classYear: typeof body.classYear === "number" ? body.classYear : null,
      });
    }
    await writeAdminAudit(
      {
        userId: management.user.id,
        sessionId: management.sessionId,
        organizationId: management.organizationId,
        establishmentId,
      },
      deactivate ? "roster.entry_deactivated" : "roster.entry_updated",
      "roster_entry",
      id,
      request,
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RosterApplyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("Manual roster mutation failed", error);
    return NextResponse.json(
      { error: "The roster entry could not be changed." },
      { status: 500 },
    );
  }
}
