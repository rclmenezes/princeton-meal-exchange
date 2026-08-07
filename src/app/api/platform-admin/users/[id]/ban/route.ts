import { db } from "@/db";
import { user } from "@/db/schema";
import { hasValidMutationOrigin, writeAdminAudit } from "@/lib/admin-audit";
import { getManagementContext } from "@/lib/admin-authorization";
import { auth } from "@/lib/auth";
import { isPlatformAdminEmail } from "@/lib/roster-access";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

async function authorizeTarget(request: Request, context: RouteContext) {
  if (!hasValidMutationOrigin(request))
    return { error: "Invalid request origin.", status: 403 } as const;
  const management = await getManagementContext(request.headers);
  if (!management?.platformAdmin)
    return { error: "Not found.", status: 404 } as const;
  const { id } = await context.params;
  const targets = await db.select().from(user).where(eq(user.id, id)).limit(1);
  const target = targets[0];
  if (!target) return { error: "User not found.", status: 404 } as const;
  if (target.id === management.user.id || isPlatformAdminEmail(target.email))
    return {
      error:
        "Configured platform administrators are managed through environment configuration.",
      status: 403,
    } as const;
  return { management, target } as const;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const authorized = await authorizeTarget(request, routeContext);
  if ("error" in authorized)
    return NextResponse.json(
      { error: authorized.error },
      { status: authorized.status },
    );
  let body: { reason?: string; expiresIn?: number | null } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const reason = body.reason?.trim();
  if (!reason || reason.length > 500)
    return NextResponse.json(
      { error: "Provide a ban reason of 500 characters or fewer." },
      { status: 400 },
    );
  const expiresIn = body.expiresIn;
  if (
    expiresIn !== null &&
    expiresIn !== undefined &&
    (!Number.isInteger(expiresIn) || expiresIn <= 0)
  )
    return NextResponse.json(
      { error: "Ban expiry must be a positive number of seconds." },
      { status: 400 },
    );

  await auth.api.banUser({
    headers: request.headers,
    body: {
      userId: authorized.target.id,
      banReason: reason,
      ...(expiresIn ? { banExpiresIn: expiresIn } : {}),
    },
  });
  await writeAdminAudit(
    {
      userId: authorized.management.user.id,
      sessionId: authorized.management.sessionId,
    },
    "platform.user_banned",
    "user",
    authorized.target.id,
    request,
    { reason, expiresIn: expiresIn ?? null },
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  const authorized = await authorizeTarget(request, routeContext);
  if ("error" in authorized)
    return NextResponse.json(
      { error: authorized.error },
      { status: authorized.status },
    );
  await auth.api.unbanUser({
    headers: request.headers,
    body: { userId: authorized.target.id },
  });
  await writeAdminAudit(
    {
      userId: authorized.management.user.id,
      sessionId: authorized.management.sessionId,
    },
    "platform.user_unbanned",
    "user",
    authorized.target.id,
    request,
  );
  return NextResponse.json({ success: true });
}
