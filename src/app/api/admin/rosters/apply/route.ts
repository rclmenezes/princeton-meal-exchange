import { hasValidMutationOrigin, writeAdminAudit } from "@/lib/admin-audit";
import {
  canManageRoster,
  getManagementContext,
} from "@/lib/admin-authorization";
import { applyRoster, MAX_ROSTER_BYTES, RosterApplyError } from "@/lib/roster";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const establishmentId = form.get("establishmentId");
  const checksum = form.get("checksum");
  const rosterVersionValue = form.get("rosterVersion");
  if (
    !(file instanceof File) ||
    typeof establishmentId !== "string" ||
    typeof checksum !== "string" ||
    typeof rosterVersionValue !== "string"
  ) {
    return NextResponse.json(
      { error: "The preview details are incomplete." },
      { status: 400 },
    );
  }
  if (file.size > MAX_ROSTER_BYTES) {
    return NextResponse.json(
      { error: "Roster CSV files must be 2 MB or smaller." },
      { status: 413 },
    );
  }

  const rosterVersion = Number(rosterVersionValue);
  if (!Number.isInteger(rosterVersion) || rosterVersion < 0) {
    return NextResponse.json(
      { error: "The roster version is invalid." },
      { status: 400 },
    );
  }

  const context = await getManagementContext(request.headers, establishmentId);
  if (
    !context ||
    !canManageRoster(context) ||
    context.establishmentId !== establishmentId
  ) {
    return NextResponse.json({ error: "Roster not found." }, { status: 404 });
  }

  try {
    const result = await applyRoster({
      contents: await file.text(),
      filename: file.name.slice(0, 255) || "roster.csv",
      checksum,
      rosterVersion,
      establishmentId,
      uploaderUserId: context.user.id,
    });
    await writeAdminAudit(
      {
        userId: context.user.id,
        sessionId: context.sessionId,
        organizationId: context.organizationId,
        establishmentId,
      },
      "roster.applied",
      "establishment",
      establishmentId,
      request,
      result,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RosterApplyError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Roster apply failed", error);
    return NextResponse.json(
      { error: "The roster could not be applied." },
      { status: 500 },
    );
  }
}
