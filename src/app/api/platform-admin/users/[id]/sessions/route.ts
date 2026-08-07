import { db } from "@/db";
import { session, user } from "@/db/schema";
import { hasValidMutationOrigin, writeAdminAudit } from "@/lib/admin-audit";
import { getManagementContext } from "@/lib/admin-authorization";
import { auth } from "@/lib/auth";
import { isDevelopmentPlatformAdminBypassEnabled } from "@/lib/auth-context";
import { isPlatformAdminEmail } from "@/lib/roster-access";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const management = await getManagementContext(request.headers);
  if (!management?.platformAdmin)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { id } = await context.params;
  const targets = await db.select().from(user).where(eq(user.id, id)).limit(1);
  const target = targets[0];
  if (!target)
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (target.id === management.user.id || isPlatformAdminEmail(target.email))
    return NextResponse.json(
      {
        error:
          "Configured platform administrators are managed through environment configuration.",
      },
      { status: 403 },
    );

  if (isDevelopmentPlatformAdminBypassEnabled()) {
    await db.delete(session).where(eq(session.userId, target.id));
  } else {
    await auth.api.revokeUserSessions({
      headers: request.headers,
      body: { userId: target.id },
    });
  }
  await writeAdminAudit(
    { userId: management.user.id, sessionId: management.sessionId },
    "platform.sessions_revoked",
    "user",
    target.id,
    request,
  );
  return NextResponse.json({ success: true });
}
