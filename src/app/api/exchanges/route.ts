import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { establishment, exchange, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  DEMO_LOCATIONS,
  DEMO_STUDENTS,
  DEMO_USER,
  isDevelopmentDemoMode,
} from "@/lib/demo-data";
import {
  createBarcodeValue,
  deriveInvitationToken,
  fingerprintExchangeInput,
  getExchangeSecret,
  hashInvitationToken,
  invitationExpiry,
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
  const demoMode = isDevelopmentDemoMode();
  const session = demoMode
    ? { user: DEMO_USER }
    : await auth.api.getSession({ headers: request.headers });
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
  if (validation.data.counterpartId === session.user.id) {
    return NextResponse.json(
      { error: "Choose another student as your counterpart." },
      { status: 400 },
    );
  }

  if (demoMode) {
    const counterpart = DEMO_STUDENTS.find(
      (student) => student.id === validation.data.counterpartId,
    );
    const location = DEMO_LOCATIONS.find(
      (candidate) => candidate.id === validation.data.establishmentId,
    );
    if (!counterpart || !location) {
      return NextResponse.json(
        { error: "Choose a student and location from the demo data." },
        { status: 422 },
      );
    }
    if (!counterpart.eligible) {
      return NextResponse.json(
        {
          error: `${counterpart.name} is not eligible under the latest meal-plan roster.`,
        },
        { status: 422 },
      );
    }
    if (
      location.type === "eating_club" &&
      counterpart.homeEstablishmentId !== location.id
    ) {
      return NextResponse.json(
        {
          error:
            "For this demo, choose the eating club that belongs to the selected student.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        id: randomUUID(),
        status: "pending",
        invitationEmailStatus: "skipped-demo",
        demo: true,
        exchange: {
          counterpartName: counterpart.name,
          locationName: location.name,
          mealType: validation.data.mealType,
          date: validation.data.date,
        },
      },
      { status: 201 },
    );
  }

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
        inArray(user.id, [session.user.id, validation.data.counterpartId]),
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
    (person) => person.id === session.user.id,
  );
  const counterpart = participants.find(
    (person) => person.id === validation.data.counterpartId,
  );
  const location = locations[0];

  if (!initiator || !counterpart) {
    return NextResponse.json(
      { error: "Both students must be present in the latest roster." },
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

  let mealHost = initiator;
  let mealGuest = counterpart;
  if (location.type === "eating_club") {
    if (counterpart.homeEstablishmentId === location.id) {
      mealHost = counterpart;
      mealGuest = initiator;
    } else if (initiator.homeEstablishmentId !== location.id) {
      return NextResponse.json(
        { error: "The selected eating club must be home to one participant." },
        { status: 422 },
      );
    }
  } else if (
    initiator.homeEstablishmentId &&
    !counterpart.homeEstablishmentId
  ) {
    mealHost = counterpart;
    mealGuest = initiator;
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
              eq(exchange.counterpartUserId, participantId),
            ),
          ),
        );
      return result[0]?.value ?? 0;
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

  const fingerprint = fingerprintExchangeInput(validation.data);
  const pairKey = [initiator.id, counterpart.id].sort().join(":");
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
        counterpartUserId: counterpart.id,
        mealHostUserId: mealHost.id,
        mealGuestUserId: mealGuest.id,
        pairKey,
        hostName: initiator.name,
        counterpartName: counterpart.name,
        counterpartEmail: counterpart.email.toLowerCase(),
        location: location.name,
        establishmentId: location.id,
        mealType: validation.data.mealType,
        exchangeDate: validation.data.date,
        expiresAt: invitationExpiry(),
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
