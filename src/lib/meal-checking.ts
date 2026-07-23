import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { exchange, mealCheckSession } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

// Princeton, New Jersey time zone
export const MEAL_CHECKING_TIME_ZONE = "America/New_York";

export type MealCheckFailure =
  | "invalid_code"
  | "not_found"
  | "not_accepted"
  | "already_completed"
  | "wrong_date"
  | "inactive_session"
  | "concurrent_check_in";

// Carries a stable failure reason alongside a user-facing message.
export class MealCheckError extends Error {
  constructor(
    public readonly reason: MealCheckFailure,
    message: string,
  ) {
    super(message);
    this.name = "MealCheckError";
  }
}

// Converts typed or scanned codes into the stored door-code format.
export function normalizeDoorCode(value: unknown) {
  if (typeof value !== "string") return null;

  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  if (!/^ME[A-Z0-9]{12}$/.test(compact)) return null;

  return `ME-${compact.slice(2, 6)}-${compact.slice(6, 10)}-${compact.slice(10, 14)}`;
}

// Compares meal dates in the configured venue time zone.
export function isSameMealDate(
  scheduledAt: Date,
  now = new Date(),
  timeZone = MEAL_CHECKING_TIME_ZONE,
) {
  return dateKey(scheduledAt, timeZone) === dateKey(now, timeZone);
}

// Resumes the checker's active session or creates one safely.
export async function startMealCheckSession(checkerUserId: string) {
  // Reuse an existing session when the page is reopened.
  const active = await db.query.mealCheckSession.findFirst({
    where: and(
      eq(mealCheckSession.checkerUserId, checkerUserId),
      isNull(mealCheckSession.endedAt),
    ),
  });
  if (active) return active;

  // Let the unique active-session index resolve concurrent starts.
  const inserted = await db
    .insert(mealCheckSession)
    .values({ id: randomUUID(), checkerUserId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  // Return the session created by the competing request.
  const concurrentlyCreated = await db.query.mealCheckSession.findFirst({
    where: and(
      eq(mealCheckSession.checkerUserId, checkerUserId),
      isNull(mealCheckSession.endedAt),
    ),
  });
  if (!concurrentlyCreated) {
    throw new Error("The meal-checking session could not be started.");
  }
  return concurrentlyCreated;
}

// Ends an active session only when it belongs to the current checker.
export async function endMealCheckSession(
  sessionId: string,
  checkerUserId: string,
) {
  const endedAt = new Date();
  const ended = await db
    .update(mealCheckSession)
    .set({ endedAt })
    .where(
      and(
        eq(mealCheckSession.id, sessionId),
        eq(mealCheckSession.checkerUserId, checkerUserId),
        isNull(mealCheckSession.endedAt),
      ),
    )
    .returning({ id: mealCheckSession.id, endedAt: mealCheckSession.endedAt });

  return ended[0] ?? null;
}

// Validates a door pass and atomically completes its accepted exchange.
// Throws a categorized error for every expected rejection.
export async function checkInExchange({
  code,
  sessionId,
  checkerUserId,
  now = new Date(),
}: {
  code: unknown;
  sessionId: string;
  checkerUserId: string;
  now?: Date;
}) {
  // Normalize manual and scanned input before querying.
  const normalizedCode = normalizeDoorCode(code);
  if (!normalizedCode) {
    throw new MealCheckError(
      "invalid_code",
      "Enter the complete door code shown on the guest’s pass.",
    );
  }

  // Require an active session owned by the authenticated checker.
  const activeSession = await db.query.mealCheckSession.findFirst({
    where: and(
      eq(mealCheckSession.id, sessionId),
      eq(mealCheckSession.checkerUserId, checkerUserId),
      isNull(mealCheckSession.endedAt),
    ),
  });
  if (!activeSession) {
    throw new MealCheckError(
      "inactive_session",
      "This checking session has ended. Return home and start a new session.",
    );
  }

  // Validate the exchange lifecycle and scheduled New York date.
  const record = await db.query.exchange.findFirst({
    where: eq(exchange.barcodeValue, normalizedCode),
  });
  if (!record) {
    throw new MealCheckError(
      "not_found",
      "We couldn’t find an exchange for that door code.",
    );
  }
  if (record.status === "completed") {
    throw new MealCheckError(
      "already_completed",
      "This exchange has already been checked in.",
    );
  }
  if (record.status !== "accepted") {
    throw new MealCheckError(
      "not_accepted",
      "This exchange is still awaiting acceptance.",
    );
  }
  if (!isSameMealDate(record.expiresAt, now)) {
    throw new MealCheckError(
      "wrong_date",
      `This exchange is scheduled for ${formatMealDate(record.expiresAt)}, not today.`,
    );
  }

  // Guard the update by accepted status to prevent duplicate check-ins.
  const completed = await db
    .update(exchange)
    .set({
      status: "completed",
      completedAt: now,
      mealCheckSessionId: activeSession.id,
      updatedAt: now,
    })
    .where(and(eq(exchange.id, record.id), eq(exchange.status, "accepted")))
    .returning({
      id: exchange.id,
      guestName: exchange.counterpartName,
      mealType: exchange.mealType,
      completedAt: exchange.completedAt,
    });

  // A missing result means another checker completed it first.
  if (!completed[0]) {
    throw new MealCheckError(
      "concurrent_check_in",
      "This exchange was checked in by another checker moments ago.",
    );
  }
  return completed[0];
}

// Produces a date-only key in the requested time zone.
function dateKey(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(value);
}

// Formats the scheduled meal date for validation errors.
function formatMealDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: MEAL_CHECKING_TIME_ZONE,
  }).format(value);
}
