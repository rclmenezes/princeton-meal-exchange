import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";

export type AuditActor = {
  userId: string | null;
  sessionId?: string | null;
  organizationId?: string | null;
  establishmentId?: string | null;
};

export function requestAuditMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function writeAdminAudit(
  actor: AuditActor,
  action: string,
  targetType: string,
  targetId: string | null,
  request?: Request,
  metadata?: Record<string, unknown>,
) {
  const requestMetadata = request
    ? requestAuditMetadata(request)
    : { ipAddress: null, userAgent: null };

  await db.insert(adminAuditLog).values({
    actorUserId: actor.userId,
    sessionId: actor.sessionId ?? null,
    action,
    targetType,
    targetId,
    organizationId: actor.organizationId ?? null,
    establishmentId: actor.establishmentId ?? null,
    metadata: metadata ?? null,
    ...requestMetadata,
  });
}

export function hasValidMutationOrigin(request: Request) {
  const source =
    request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return process.env.NODE_ENV !== "production";

  try {
    const sourceOrigin = new URL(source).origin;
    const requestOrigin = new URL(request.url).origin;
    const configuredOrigins = [
      process.env.BETTER_AUTH_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => new URL(value).origin);
    return (
      sourceOrigin === requestOrigin || configuredOrigins.includes(sourceOrigin)
    );
  } catch {
    return false;
  }
}
