import { db } from "@/db";
import { exchange } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  isDevelopmentAuthBypassEnabled,
  isExchangeCounterpart,
  isExchangeExpired,
} from "@/lib/exchange";
import {
  appUrlFromRequest,
  deliverConfirmationEmail,
  getExchangeByToken,
} from "@/lib/exchange-service";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  let record = await getExchangeByToken(token);
  if (!record) {
    return NextResponse.json({ error: "Exchange not found." }, { status: 404 });
  }

  const authBypassed = isDevelopmentAuthBypassEnabled();
  const session = authBypassed
    ? null
    : await auth.api.getSession({ headers: request.headers });
  if (!authBypassed && !session) {
    return NextResponse.json(
      { error: "Sign in with the account that received this invitation." },
      { status: 401 },
    );
  }

  const isCounterpart = authBypassed
    ? true
    : isExchangeCounterpart(
        record.counterpartUserId,
        record.counterpartEmail,
        record.status,
        session?.user,
      );
  if (!isCounterpart) {
    return NextResponse.json(
      {
        error:
          "This invitation belongs to a different account. Sign in with the email that received it.",
      },
      { status: 403 },
    );
  }
  if (isExchangeExpired(record.expiresAt)) {
    return NextResponse.json(
      { error: "This exchange invitation has expired." },
      { status: 410 },
    );
  }
  if (record.status === "pending") {
    await db
      .update(exchange)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        ...(session ? { counterpartUserId: session.user.id } : {}),
        confirmationEmailStatus: "pending",
        updatedAt: new Date(),
      })
      .where(and(eq(exchange.id, record.id), eq(exchange.status, "pending")));

    record = await getExchangeByToken(token);
    if (!record) {
      return NextResponse.json(
        { error: "Exchange not found." },
        { status: 404 },
      );
    }
    if (
      !authBypassed &&
      !isExchangeCounterpart(
        record.counterpartUserId,
        record.counterpartEmail,
        record.status,
        session?.user,
      )
    ) {
      return NextResponse.json(
        { error: "This exchange was accepted by a different account." },
        { status: 403 },
      );
    }
  }

  let confirmationEmailStatus = record.confirmationEmailStatus;
  if (confirmationEmailStatus !== "sent") {
    try {
      const delivery = await deliverConfirmationEmail(
        record,
        appUrlFromRequest(request),
      );
      confirmationEmailStatus = delivery.status;
    } catch (error) {
      console.error("Failed to send exchange confirmation", error);
      confirmationEmailStatus = "failed";
    }
  }

  return NextResponse.json({
    id: record.id,
    status: "accepted",
    barcodeValue: record.barcodeValue,
    confirmationEmailStatus,
  });
}
