import { describe, expect, it } from "vitest";
import {
  createBarcodeValue,
  deriveInvitationToken,
  fingerprintExchangeInput,
  hashInvitationToken,
  isDevelopmentAuthBypassEnabled,
  isExchangeCounterpart,
  isExchangeExpired,
  isInviteRecipient,
  normalizeEmail,
  validateCreateExchangeInput,
} from "./exchange";
import { isDevelopmentDemoMode } from "./demo-data";

const validInput = {
  counterpartId: "student-2",
  establishmentId: "3ec6de13-73b7-4baa-8497-dce75c34f908",
  mealType: "dinner",
  date: "2030-05-12",
};

describe("exchange input", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  STUDENT@Princeton.EDU ")).toBe(
      "student@princeton.edu",
    );
  });

  it("matches the invited user to the current user by normalized email", () => {
    expect(
      isInviteRecipient(" STUDENT@princeton.edu ", "student@PRINCETON.EDU"),
    ).toBe(true);
    expect(
      isInviteRecipient("student@princeton.edu", "other@princeton.edu"),
    ).toBe(false);
    expect(isInviteRecipient("student@princeton.edu", null)).toBe(false);
  });

  it("uses the linked counterpart ID after an invitation is claimed", () => {
    expect(
      isExchangeCounterpart(null, "student@princeton.edu", "pending", {
        id: "student-1",
        email: "STUDENT@princeton.edu",
      }),
    ).toBe(true);
    expect(
      isExchangeCounterpart("student-1", "old@princeton.edu", "accepted", {
        id: "student-1",
        email: "new@princeton.edu",
      }),
    ).toBe(true);
    expect(
      isExchangeCounterpart("student-1", "student@princeton.edu", "accepted", {
        id: "student-2",
        email: "student@princeton.edu",
      }),
    ).toBe(false);
    expect(
      isExchangeCounterpart(null, "student@princeton.edu", "accepted", {
        id: "student-2",
        email: "student@princeton.edu",
      }),
    ).toBe(false);
  });

  it("allows auth bypass only outside production", () => {
    expect(isDevelopmentAuthBypassEnabled("development", "true")).toBe(true);
    expect(isDevelopmentAuthBypassEnabled("test", "true")).toBe(true);
    expect(isDevelopmentAuthBypassEnabled("production", "true")).toBe(false);
    expect(isDevelopmentAuthBypassEnabled("development", "false")).toBe(false);
  });

  it("allows demo mode only outside production", () => {
    expect(isDevelopmentDemoMode("development", "true")).toBe(true);
    expect(isDevelopmentDemoMode("production", "true")).toBe(false);
    expect(isDevelopmentDemoMode("development", "false")).toBe(false);
  });

  it("determines expiration against an explicit clock", () => {
    const now = new Date("2030-05-12T23:00:00.000Z");
    expect(isExchangeExpired(new Date("2030-05-12T22:59:59.000Z"), now)).toBe(
      true,
    );
    expect(isExchangeExpired(new Date("2030-05-12T23:00:01.000Z"), now)).toBe(
      false,
    );
  });

  it("validates and normalizes a complete exchange", () => {
    const result = validateCreateExchangeInput(
      validInput,
      new Date("2029-01-01T00:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.counterpartId).toBe("student-2");
      expect(result.data.date).toBe("2030-05-12");
    }
  });

  it("rejects past meals and malformed input", () => {
    expect(
      validateCreateExchangeInput(validInput, new Date("2031-01-01")),
    ).toMatchObject({ ok: false });
    expect(
      validateCreateExchangeInput({ ...validInput, mealType: "breakfast" }),
    ).toEqual({ ok: false, error: "Meal type must be lunch or dinner." });
    expect(
      validateCreateExchangeInput({ ...validInput, counterpartId: "" }),
    ).toEqual({
      ok: false,
      error: "Choose a student from the search results.",
    });
  });

  it("creates a stable request fingerprint", () => {
    const first = validateCreateExchangeInput(
      validInput,
      new Date("2029-01-01"),
    );
    const second = validateCreateExchangeInput(
      { ...validInput },
      new Date("2029-01-01"),
    );
    if (!first.ok || !second.ok) throw new Error("Fixture should be valid");
    expect(fingerprintExchangeInput(first.data)).toBe(
      fingerprintExchangeInput(second.data),
    );
  });
});

describe("exchange credentials", () => {
  it("derives stable opaque tokens and stores a separate hash", () => {
    const token = deriveInvitationToken("exchange-id", "secret");
    expect(token).toBe(deriveInvitationToken("exchange-id", "secret"));
    expect(token).not.toContain("exchange-id");
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(token)).not.toBe(token);
  });

  it("creates human-readable Code 128 values", () => {
    const first = createBarcodeValue();
    const second = createBarcodeValue();
    expect(first).toMatch(
      /^ME-[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}$/,
    );
    expect(second).not.toBe(first);
  });
});
