import { synchronizeUserAccess } from "@/lib/access-provisioning";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const current = await auth.api.getSession({ headers: request.headers });
  if (!current) return NextResponse.redirect(new URL("/", request.url));

  const synchronized = await synchronizeUserAccess(current.user.id);
  const destination =
    synchronized.destination === "platform-admin"
      ? "/platform-admin"
      : synchronized.destination === "organization-admin"
        ? "/admin"
        : synchronized.destination === "organization-pending"
          ? "/organization-pending"
          : synchronized.destination === "denied"
            ? "/?access=denied"
            : "/";
  return NextResponse.redirect(new URL(destination, request.url));
}
