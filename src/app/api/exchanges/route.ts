import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { establishment, exchange, user } from "@/db/schema";
import { ensureDevelopmentAuthUser, getAuthContext } from "@/lib/auth-context";
import {
  createBarcodeValue,
  deriveInvitationToken,
  deriveMealRoles,
  fingerprintExchangeInput,
  getExchangeSecret,
  hashInvitationToken,
  invitationExpiryForDate,
  MAX_OPEN_EXCHANGES,
  validateCreateExchangeInput,
} from "@/lib/exchange";
import {
  appUrlFromRequest,
  deliverInvitationEmail,
  getExchangeDetailUrl,
} from "@/lib/exchange-service";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authContext = await getAuthContext(request.headers);
  if (!authContext.user) {
    return NextResponse.json(
      { error: "Sign in before creating an exchange." },
      { status: 401 },
    );
  }
  if (authContext.authBypassed) await ensureDevelopmentAuthUser();
  const currentUser = authContext.user;

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
  if (validation.data.counterpartId === currentUser.id) {
    return NextResponse.json(
      { error: "Choose another student as your counterpart." },
      { status: 400 },
    );
  }

  const fingerprint = fingerprintExchangeInput(validation.data);
  let record = await db.query.exchange.findFirst({
    where: and(
      eq(exchange.hostUserId, currentUser.id),
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
    const [participants, locations] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          eligible: user.isExchangeEligible,
          homeEstablishmentId: user.homeEstablishmentId,
        })
        .from(user)
        .where(
          inArray(user.id, [currentUser.id, validation.data.counterpartId]),
        ),
      db
        .select()
        .from(establishment)
        .where(
          and(
            eq(establishment.id, validation.data.establishmentId),
            eq(establishment.isActive, true),
          ),
        )
        .limit(1),
    ]);
    const initiator = participants.find(
      (person) => person.id === currentUser.id,
    );
    const counterpart = participants.find(
      (person) => person.id === validation.data.counterpartId,
    );
    const location = locations[0];

    if (!initiator || !counterpart) {
      return NextResponse.json(
        { error: "Both students must be present in the eligibility roster." },
        { status: 422 },
      );
    }
    if (!location) {
      return NextResponse.json(
        { error: "That host location is no longer available." },
        { status: 422 },
      );
    }

    const ineligible = [initiator, counterpart].filter(
      (person) => !person.eligible,
    );
    if (ineligible.length > 0) {
      return NextResponse.json(
        {
          error: `${ineligible.map((person) => person.name).join(" and ")} ${
            ineligible.length === 1 ? "is" : "are"
          } not eligible under the latest meal-plan roster.`,
        },
        { status: 422 },
      );
    }

    const roles = deriveMealRoles(initiator, counterpart, location);
    if (!roles.ok) {
      return NextResponse.json({ error: roles.error }, { status: 422 });
    }

    const openCounts = await Promise.all(
      [initiator.id, counterpart.id].map(async (participantId) => {
        const result = await db
          .select({ value: count() })
          .from(exchange)
          .where(
            and(
              inArray(exchange.status, ["pending", "accepted"]),
              or(
                eq(exchange.hostUserId, participantId),
                eq(exchange.mealGuestUserId, participantId),
                eq(exchange.mealHostUserId, participantId),
              ),
            ),
          );
        return Number(result[0]?.value ?? 0);
      }),
    );
    if (openCounts.some((value) => value >= MAX_OPEN_EXCHANGES)) {
      return NextResponse.json(
        {
          error: `Each student may have at most ${MAX_OPEN_EXCHANGES} open exchanges.`,
        },
        { status: 409 },
      );
    }

    const pairKey = [initiator.id, counterpart.id].sort().join(":");
    const duplicate = await db.query.exchange.findFirst({
      where: and(
        eq(exchange.pairKey, pairKey),
        eq(exchange.exchangeDate, validation.data.date),
        eq(exchange.mealType, validation.data.mealType),
        eq(exchange.establishmentId, location.id),
      ),
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "This exact exchange has already been created." },
        { status: 409 },
      );
    }

    const id = randomUUID();
    const invitationToken = deriveInvitationToken(id, getExchangeSecret());
    const inserted = await db
      .insert(exchange)
      .values({
        id,
        hostUserId: initiator.id,
        mealHostUserId: roles.host.id,
        mealGuestUserId: roles.guest.id,
        pairKey,
        hostName: initiator.name,
        counterpartName: counterpart.name,
        counterpartEmail: counterpart.email.toLowerCase(),
        location: location.name,
        establishmentId: location.id,
        mealType: validation.data.mealType,
        exchangeDate: validation.data.date,
        expiresAt: invitationExpiryForDate(validation.data.date),
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
            eq(exchange.hostUserId, currentUser.id),
            eq(exchange.idempotencyKey, idempotencyKey),
          ),
    });
  }

  if (!record) {
    return NextResponse.json(
      { error: "This exchange conflicts with an existing invitation." },
      { status: 409 },
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
        exchange: {
          counterpartName: record.counterpartName,
          locationName: record.location,
          mealType: record.mealType,
          date: record.exchangeDate,
        },
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
