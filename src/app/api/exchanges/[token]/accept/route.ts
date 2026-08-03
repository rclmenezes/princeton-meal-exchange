import { db } from "@/db";
import { exchange } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-context";
import {
  isExchangeCounterpart,
  isExchangeExpired,
  isMealDatePast,
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

  const authContext = await getAuthContext(request.headers);
  const { authBypassed } = authContext;
  if (!authBypassed && !authContext.user) {
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
        authContext.user,
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
  if (record.status === "completed") {
    return NextResponse.json(
      {
        error: "This meal exchange has already been completed.",
        status: "completed",
      },
      { status: 409 },
    );
  }
  if (isMealDatePast(record.exchangeDate)) {
    return NextResponse.json(
      { error: "The scheduled meal date has passed." },
      { status: 410 },
    );
  }
  if (record.status === "pending" && isExchangeExpired(record.expiresAt)) {
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
        ...(!authBypassed && authContext.user
          ? { counterpartUserId: authContext.user.id }
          : {}),
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
        authContext.user,
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
