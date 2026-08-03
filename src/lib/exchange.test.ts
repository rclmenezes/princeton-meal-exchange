import { describe, expect, it } from "vitest";
import {
  createBarcodeValue,
  deriveInvitationToken,
  deriveMealRoles,
  fingerprintExchangeInput,
  hashInvitationToken,
  invitationExpiryForDate,
  isExchangeCounterpart,
  isExchangeExpired,
  isInviteRecipient,
  isMealDatePast,
  normalizeEmail,
  validateCreateExchangeInput,
} from "./exchange";

const validInput = {
  counterpartId: "student-2",
  establishmentId: "3ec6de13-73b7-4baa-8497-dce75c34f908",
  mealType: "dinner",
  date: "2030-05-12",
};

describe("exchange input", () => {
  it("normalizes and matches invitation email addresses", () => {
    expect(normalizeEmail("  STUDENT@Princeton.EDU ")).toBe(
      "student@princeton.edu",
    );
    expect(
      isInviteRecipient(" STUDENT@princeton.edu ", "student@PRINCETON.EDU"),
    ).toBe(true);
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
  });

  it("distinguishes invitation expiration from the meal date", () => {
    const now = new Date("2030-05-12T23:00:00.000Z");
    expect(isExchangeExpired(new Date("2030-05-12T22:59:59.000Z"), now)).toBe(
      true,
    );
    expect(isMealDatePast("2030-05-11", now)).toBe(true);
    expect(isMealDatePast("2030-05-12", now)).toBe(false);
  });

  it("validates a complete exchange and rejects malformed input", () => {
    const valid = validateCreateExchangeInput(
      validInput,
      new Date("2029-01-01T00:00:00.000Z"),
    );
    expect(valid).toEqual({ ok: true, data: validInput });

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

  it("limits invitation acceptance to seven days or the meal date", () => {
    expect(
      invitationExpiryForDate(
        "2030-05-20",
        new Date("2030-05-01T12:00:00.000Z"),
      ).toISOString(),
    ).toBe("2030-05-08T12:00:00.000Z");
    expect(
      invitationExpiryForDate(
        "2030-05-02",
        new Date("2030-05-01T12:00:00.000Z"),
      ).toISOString(),
    ).toBe("2030-05-03T03:59:59.999Z");
  });
});

describe("meal roles", () => {
  const diningStudent = { id: "dining", homeEstablishmentId: null };
  const clubStudent = { id: "club", homeEstablishmentId: "club-1" };

  it("derives roles symmetrically at a dining hall and eating club", () => {
    expect(
      deriveMealRoles(clubStudent, diningStudent, {
        id: "hall-1",
        type: "dining_hall",
      }),
    ).toMatchObject({ ok: true, host: diningStudent, guest: clubStudent });
    expect(
      deriveMealRoles(diningStudent, clubStudent, {
        id: "club-1",
        type: "eating_club",
      }),
    ).toMatchObject({ ok: true, host: clubStudent, guest: diningStudent });
  });

  it("rejects locations that do not identify exactly one host", () => {
    expect(
      deriveMealRoles(
        diningStudent,
        { ...diningStudent, id: "dining-2" },
        {
          id: "hall-1",
          type: "dining_hall",
        },
      ),
    ).toMatchObject({ ok: false });
    expect(
      deriveMealRoles(diningStudent, clubStudent, {
        id: "other-club",
        type: "eating_club",
      }),
    ).toMatchObject({ ok: false });
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
