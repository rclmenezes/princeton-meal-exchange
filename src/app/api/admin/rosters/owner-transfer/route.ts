import { hasValidMutationOrigin, writeAdminAudit } from "@/lib/admin-audit";
import {
  canManageOwners,
  getManagementContext,
} from "@/lib/admin-authorization";
import { RosterApplyError, transferOrganizationOwner } from "@/lib/roster";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  let body: { establishmentId?: string; targetEntryId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.establishmentId || !body.targetEntryId)
    return NextResponse.json({ error: "Choose a new owner." }, { status: 400 });
  const context = await getManagementContext(
    request.headers,
    body.establishmentId,
  );
  if (
    !context ||
    !canManageOwners(context) ||
    context.establishmentId !== body.establishmentId
  )
    return NextResponse.json({ error: "Roster not found." }, { status: 404 });
  try {
    await transferOrganizationOwner({
      establishmentId: body.establishmentId,
      actorUserId: context.user.id,
      targetEntryId: body.targetEntryId,
      platformAdmin: context.platformAdmin,
    });
    await writeAdminAudit(
      {
        userId: context.user.id,
        sessionId: context.sessionId,
        organizationId: context.organizationId,
        establishmentId: body.establishmentId,
      },
      "organization.owner_transferred",
      "roster_entry",
      body.targetEntryId,
      request,
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RosterApplyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("Owner transfer failed", error);
    return NextResponse.json(
      { error: "Ownership could not be transferred." },
      { status: 500 },
    );
  }
}
