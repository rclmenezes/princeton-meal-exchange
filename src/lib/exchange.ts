import { createHash, createHmac, randomBytes } from "node:crypto";

export const MEAL_TYPES = ["lunch", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export type CreateExchangeInput = {
  counterpartName: string;
  counterpartEmail: string;
  location: string;
  mealType: MealType;
  expiresAt: string;
};

export type ValidatedCreateExchangeInput = Omit<
  CreateExchangeInput,
  "expiresAt"
> & {
  expiresAt: Date;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BARCODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// Canonicalizes emails for reliable invitation matching.
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// Checks whether the current email owns a pending invitation.
export function isInviteRecipient(
  invitedEmail: string,
  currentUserEmail: string | null | undefined,
) {
  if (!currentUserEmail) return false;
  return normalizeEmail(invitedEmail) === normalizeEmail(currentUserEmail);
}

// Authorizes a counterpart by claimed user ID or pending invitation email.
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

// Enables the explicit auth bypass only outside production.
export function isDevelopmentAuthBypassEnabled(
  nodeEnv = process.env.NODE_ENV,
  configuredValue = process.env.DEV_BYPASS_AUTH,
) {
  return nodeEnv !== "production" && configuredValue === "true";
}

// Checks whether an exchange deadline has passed.
export function isExchangeExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

// Validates and normalizes untrusted exchange-creation input.
// Returns either typed data or a user-facing validation error.
export function validateCreateExchangeInput(
  value: unknown,
  now = new Date(),
):
  | { ok: true; data: ValidatedCreateExchangeInput }
  | { ok: false; error: string } {
  // Require a JSON object before reading individual fields.
  if (!value || typeof value !== "object") {
    return { ok: false, error: "A JSON request body is required." };
  }

  // Normalize text, email, meal type, and the requested date.
  const input = value as Record<string, unknown>;
  const counterpartName = cleanBoundedText(input.counterpartName, 120);
  const counterpartEmail =
    typeof input.counterpartEmail === "string"
      ? normalizeEmail(input.counterpartEmail)
      : "";
  const location = cleanBoundedText(input.location, 160);
  const meal = input.mealType;
  const expiresAt =
    typeof input.expiresAt === "string" ? new Date(input.expiresAt) : null;

  // Validate each field and return the most useful failure.
  if (!counterpartName) {
    return {
      ok: false,
      error: "Counterpart name must be between 1 and 120 characters.",
    };
  }
  if (!EMAIL_PATTERN.test(counterpartEmail) || counterpartEmail.length > 320) {
    return { ok: false, error: "A valid counterpart email is required." };
  }
  if (!location) {
    return {
      ok: false,
      error: "Location must be between 1 and 160 characters.",
    };
  }
  if (meal !== "lunch" && meal !== "dinner") {
    return { ok: false, error: "Meal type must be lunch or dinner." };
  }
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: "A valid ISO expiration date is required." };
  }
  if (expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "The expiration date must be in the future." };
  }

  // Return only cleaned values safe for persistence.
  return {
    ok: true,
    data: {
      counterpartName,
      counterpartEmail,
      location,
      mealType: meal,
      expiresAt,
    },
  };
}

// Creates a stable digest for idempotent request comparison.
export function fingerprintExchangeInput(input: ValidatedCreateExchangeInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        counterpartName: input.counterpartName,
        counterpartEmail: input.counterpartEmail,
        location: input.location,
        mealType: input.mealType,
        expiresAt: input.expiresAt.toISOString(),
      }),
    )
    .digest("hex");
}

// Derives an unguessable invitation token from the exchange ID.
export function deriveInvitationToken(exchangeId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`exchange-invitation:${exchangeId}`)
    .digest("base64url");
}

// Hashes invitation tokens before database lookup or storage.
export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Generates the shared Code 128 payload and fallback door code.
export function createBarcodeValue() {
  const bytes = randomBytes(12);
  let code = "";
  for (const byte of bytes) {
    code += BARCODE_ALPHABET[byte % BARCODE_ALPHABET.length];
  }
  return `ME-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

// Loads the token secret with a development-only fallback.
export function getExchangeSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required to secure exchange links.");
  }
  return "development-only-princeton-meal-exchange-secret";
}

// Trims, collapses whitespace, and enforces a text length limit.
function cleanBoundedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}
