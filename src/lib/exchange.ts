import { createHash, createHmac, randomBytes } from "node:crypto";

export const MEAL_TYPES = ["lunch", "dinner"] as const;
export const MAX_OPEN_EXCHANGES = 10;
export const ACCEPTANCE_WINDOW_DAYS = 7;
export const PRINCETON_TIME_ZONE = "America/New_York";

export type MealType = (typeof MEAL_TYPES)[number];

export type CreateExchangeInput = {
  counterpartId: string;
  establishmentId: string;
  mealType: MealType;
  date: string;
};

export type ValidatedCreateExchangeInput = CreateExchangeInput;

type MealParticipant = {
  id: string;
  homeEstablishmentId: string | null;
};

type MealEstablishment = {
  id: string;
  type: "dining_hall" | "eating_club";
};

const BARCODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isInviteRecipient(
  invitedEmail: string,
  currentUserEmail: string | null | undefined,
) {
  if (!currentUserEmail) return false;
  return normalizeEmail(invitedEmail) === normalizeEmail(currentUserEmail);
}

export function isExchangeCounterpart(
  counterpartUserId: string | null | undefined,
  invitedEmail: string,
  status: "pending" | "accepted" | "completed",
  currentUser: { id: string; email: string } | null | undefined,
) {
  if (!currentUser) return false;
  return counterpartUserId
    ? counterpartUserId === currentUser.id
    : status === "pending" &&
        isInviteRecipient(invitedEmail, currentUser.email);
}

export function isExchangeExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function isMealDatePast(exchangeDate: string, now = new Date()) {
  return exchangeDate < princetonDateString(now);
}

export function validateCreateExchangeInput(
  value: unknown,
  now = new Date(),
):
  | { ok: true; data: ValidatedCreateExchangeInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "A JSON request body is required." };
  }

  const input = value as Record<string, unknown>;
  const counterpartId = cleanBoundedText(input.counterpartId, 200);
  const establishmentId = cleanBoundedText(input.establishmentId, 200);
  const meal = input.mealType;
  const date = typeof input.date === "string" ? input.date : "";

  if (!counterpartId) {
    return { ok: false, error: "Choose a student from the search results." };
  }
  if (!establishmentId) {
    return { ok: false, error: "Choose a host location." };
  }
  if (meal !== "lunch" && meal !== "dinner") {
    return { ok: false, error: "Meal type must be lunch or dinner." };
  }
  if (!isIsoDate(date)) {
    return { ok: false, error: "Choose a valid exchange date." };
  }
  if (date < princetonDateString(now)) {
    return { ok: false, error: "The exchange date cannot be in the past." };
  }

  return {
    ok: true,
    data: { counterpartId, establishmentId, mealType: meal, date },
  };
}

export function fingerprintExchangeInput(input: ValidatedCreateExchangeInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        counterpartId: input.counterpartId,
        establishmentId: input.establishmentId,
        mealType: input.mealType,
        date: input.date,
      }),
    )
    .digest("hex");
}

export function invitationExpiryForDate(
  exchangeDate: string,
  now = new Date(),
) {
  const acceptanceLimit = new Date(now);
  acceptanceLimit.setUTCDate(
    acceptanceLimit.getUTCDate() + ACCEPTANCE_WINDOW_DAYS,
  );
  const mealDateLimit = endOfPrincetonDate(exchangeDate);
  return mealDateLimit < acceptanceLimit ? mealDateLimit : acceptanceLimit;
}

export function deriveMealRoles(
  first: MealParticipant,
  second: MealParticipant,
  establishment: MealEstablishment,
):
  | { ok: true; host: MealParticipant; guest: MealParticipant }
  | { ok: false; error: string } {
  const firstHosts =
    establishment.type === "eating_club"
      ? first.homeEstablishmentId === establishment.id
      : first.homeEstablishmentId === null;
  const secondHosts =
    establishment.type === "eating_club"
      ? second.homeEstablishmentId === establishment.id
      : second.homeEstablishmentId === null;

  if (firstHosts === secondHosts) {
    return {
      ok: false,
      error:
        establishment.type === "eating_club"
          ? "Exactly one participant must belong to the selected eating club."
          : "Exactly one participant must be hosted by the selected dining hall.",
    };
  }

  return firstHosts
    ? { ok: true, host: first, guest: second }
    : { ok: true, host: second, guest: first };
}

export function princetonDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PRINCETON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function deriveInvitationToken(exchangeId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`exchange-invitation:${exchangeId}`)
    .digest("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createBarcodeValue() {
  const bytes = randomBytes(12);
  let code = "";
  for (const byte of bytes) {
    code += BARCODE_ALPHABET[byte % BARCODE_ALPHABET.length];
  }
  return `ME-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

export function getExchangeSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required to secure exchange links.");
  }
  return "development-only-princeton-meal-exchange-secret";
}

function endOfPrincetonDate(value: string) {
  const midday = new Date(`${value}T12:00:00Z`);
  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: PRINCETON_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(midday)
    .find((part) => part.type === "timeZoneName")?.value;
  const offset = timeZoneName?.replace("GMT", "") || "-05:00";
  return new Date(`${value}T23:59:59.999${offset}`);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function cleanBoundedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}
