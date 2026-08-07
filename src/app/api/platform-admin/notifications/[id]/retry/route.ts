import { hasValidMutationOrigin, writeAdminAudit } from "@/lib/admin-audit";
import { getManagementContext } from "@/lib/admin-authorization";
import { retryAccessNotification, RosterApplyError } from "@/lib/roster";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const context = await getManagementContext(request.headers);
  if (!context?.platformAdmin)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  try {
    await retryAccessNotification(id);
    await writeAdminAudit(
      { userId: context.user.id, sessionId: context.sessionId },
      "notification.retried",
      "access_notification",
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
    return NextResponse.json(
      { error: "Notification delivery failed again." },
      { status: 502 },
    );
  }
}
