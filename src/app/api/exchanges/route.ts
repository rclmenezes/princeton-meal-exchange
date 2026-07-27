import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { exchange } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  createBarcodeValue,
  fingerprintExchangeInput,
  getExchangeSecret,
  hashInvitationToken,
  deriveInvitationToken,
  validateCreateExchangeInput,
} from "@/lib/exchange";
import {
  appUrlFromRequest,
  deliverInvitationEmail,
  getExchangeDetailUrl,
} from "@/lib/exchange-service";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: "Sign in before creating an exchange." },
      { status: 401 },
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json(
      { error: "A valid Idempotency-Key header is required." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateCreateExchangeInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const fingerprint = fingerprintExchangeInput(validation.data);
  let record = await db.query.exchange.findFirst({
    where: and(
      eq(exchange.hostUserId, session.user.id),
      eq(exchange.idempotencyKey, idempotencyKey),
    ),
  });

  if (record && record.requestFingerprint !== fingerprint) {
    return NextResponse.json(
      { error: "This idempotency key was already used with different input." },
      { status: 409 },
    );
  }

  if (!record) {
    const id = randomUUID();
    const invitationToken = deriveInvitationToken(id, getExchangeSecret());
    const inserted = await db
      .insert(exchange)
      .values({
        id,
        hostUserId: session.user.id,
        hostName: session.user.name,
        counterpartName: validation.data.counterpartName,
        counterpartEmail: validation.data.counterpartEmail,
        location: validation.data.location,
        mealType: validation.data.mealType,
        expiresAt: validation.data.expiresAt,
        invitationTokenHash: hashInvitationToken(invitationToken),
        barcodeValue: createBarcodeValue(),
        idempotencyKey,
        requestFingerprint: fingerprint,
      })
      .onConflictDoNothing()
      .returning({ id: exchange.id });

    record = await db.query.exchange.findFirst({
      where: inserted[0]
        ? eq(exchange.id, inserted[0].id)
        : and(
            eq(exchange.hostUserId, session.user.id),
            eq(exchange.idempotencyKey, idempotencyKey),
          ),
    });
  }

  if (!record) {
    return NextResponse.json(
      { error: "The exchange could not be created." },
      { status: 500 },
    );
  }
  if (record.requestFingerprint !== fingerprint) {
    return NextResponse.json(
      { error: "This idempotency key was already used with different input." },
      { status: 409 },
    );
  }

  const appUrl = appUrlFromRequest(request);
  const detailUrl = getExchangeDetailUrl(record.id, appUrl);
  try {
    const delivery = await deliverInvitationEmail(record, appUrl);
    return NextResponse.json(
      {
        id: record.id,
        status: record.status,
        detailUrl,
        invitationEmailStatus: delivery.status,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to send exchange invitation", error);
    return NextResponse.json(
      {
        error: "The exchange was saved, but the invitation email failed.",
        id: record.id,
        status: record.status,
        detailUrl,
        invitationEmailStatus: "failed",
      },
      { status: 502 },
    );
  }
}
