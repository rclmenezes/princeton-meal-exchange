import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sessionFindFirst,
  exchangeFindFirst,
  update,
  set,
  where,
  returning,
  insert,
  values,
  onConflictDoNothing,
  insertReturning,
  select,
  from,
  eligibilityWhere,
} = vi.hoisted(() => ({
  sessionFindFirst: vi.fn(),
  exchangeFindFirst: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  insertReturning: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  eligibilityWhere: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      mealCheckSession: { findFirst: sessionFindFirst },
      exchange: { findFirst: exchangeFindFirst },
    },
    update,
    insert,
    select,
  },
}));

import {
  checkInExchange,
  isSameMealDate,
  normalizeDoorCode,
  startMealCheckSession,
} from "./meal-checking";

const activeSession = {
  id: "4f522db9-bc11-4a0d-a630-b17b0d8131e5",
  checkerUserId: "checker-1",
  startedAt: new Date(),
  endedAt: null,
};

const acceptedExchange = {
  id: "3ec6de13-73b7-4baa-8497-dce75c34f908",
  status: "accepted",
  barcodeValue: "ME-ABCD-EFGH-JKLM",
  hostUserId: "host-user-1",
  hostName: "Maya Hernandez",
  counterpartName: "Julian Park",
  mealHostUserId: "host-user-1",
  mealGuestUserId: "guest-user-1",
  mealType: "dinner",
  location: "Cottage Club",
  exchangeDate: "2026-07-23",
  expiresAt: new Date("2026-07-23T23:00:00.000Z"),
};

describe("meal-checking helpers", () => {
  it("normalizes the printed code without weakening its shape", () => {
    expect(normalizeDoorCode(" me abcd efgh jklm ")).toBe("ME-ABCD-EFGH-JKLM");
    expect(normalizeDoorCode("ME-TOO-SHORT")).toBeNull();
    expect(normalizeDoorCode(null)).toBeNull();
  });

  it("compares calendar dates in America/New_York across DST", () => {
    const lateSaturday = new Date("2026-03-08T04:30:00.000Z");
    expect(
      isSameMealDate(lateSaturday, new Date("2026-03-08T02:00:00.000Z")),
    ).toBe(true);
    expect(
      isSameMealDate(lateSaturday, new Date("2026-03-08T05:30:00.000Z")),
    ).toBe(false);
  });
});

describe("checkInExchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionFindFirst.mockResolvedValue(activeSession);
    exchangeFindFirst.mockResolvedValue(acceptedExchange);
    update.mockReturnValue({ set });
    set.mockReturnValue({ where });
    where.mockReturnValue({ returning });
    select.mockReturnValue({ from });
    from.mockReturnValue({ where: eligibilityWhere });
    eligibilityWhere.mockResolvedValue([
      { id: "host-user-1", eligible: true },
      { id: "guest-user-1", eligible: true },
    ]);
    returning.mockResolvedValue([
      {
        id: acceptedExchange.id,
        mealType: acceptedExchange.mealType,
        locationName: acceptedExchange.location,
        completedAt: new Date("2026-07-23T22:00:00.000Z"),
      },
    ]);
  });

  it("atomically completes an accepted exchange for today's session", async () => {
    const now = new Date("2026-07-23T22:00:00.000Z");
    const result = await checkInExchange({
      code: "me abcd efgh jklm",
      sessionId: activeSession.id,
      checkerUserId: "checker-1",
      now,
    });

    expect(set).toHaveBeenCalledWith({
      status: "completed",
      completedAt: now,
      mealCheckSessionId: activeSession.id,
      updatedAt: now,
    });
    expect(result).toMatchObject({
      guestName: "Julian Park",
      mealType: "dinner",
      locationName: "Cottage Club",
    });
  });

  it.each([
    ["pending", "not_accepted"],
    ["completed", "already_completed"],
  ] as const)("rejects an exchange with %s status", async (status, reason) => {
    exchangeFindFirst.mockResolvedValue({ ...acceptedExchange, status });

    await expect(
      checkInExchange({
        code: acceptedExchange.barcodeValue,
        sessionId: activeSession.id,
        checkerUserId: "checker-1",
        now: new Date("2026-07-23T22:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ reason });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a pass scheduled for a different New York date", async () => {
    await expect(
      checkInExchange({
        code: acceptedExchange.barcodeValue,
        sessionId: activeSession.id,
        checkerUserId: "checker-1",
        now: new Date("2026-07-24T22:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      reason: "wrong_date",
    });
  });

  it("fails closed when either participant is not eligible", async () => {
    eligibilityWhere.mockResolvedValue([
      { id: "host-user-1", eligible: true },
      { id: "guest-user-1", eligible: false },
    ]);

    await expect(
      checkInExchange({
        code: acceptedExchange.barcodeValue,
        sessionId: activeSession.id,
        checkerUserId: "checker-1",
        now: new Date("2026-07-23T22:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ reason: "participant_ineligible" });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns the initiator snapshot when the initiator is the meal guest", async () => {
    exchangeFindFirst.mockResolvedValue({
      ...acceptedExchange,
      mealHostUserId: "guest-user-1",
      mealGuestUserId: "host-user-1",
    });

    await expect(
      checkInExchange({
        code: acceptedExchange.barcodeValue,
        sessionId: activeSession.id,
        checkerUserId: "checker-1",
        now: new Date("2026-07-23T22:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ guestName: "Maya Hernandez" });
  });

  it("reports a concurrent duplicate when the guarded update loses the race", async () => {
    returning.mockResolvedValue([]);

    await expect(
      checkInExchange({
        code: acceptedExchange.barcodeValue,
        sessionId: activeSession.id,
        checkerUserId: "checker-1",
        now: new Date("2026-07-23T22:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      reason: "concurrent_check_in",
    });
  });
});

describe("startMealCheckSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockReturnValue({ values });
    values.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockReturnValue({ returning: insertReturning });
  });

  it("resumes the checker's existing active session", async () => {
    sessionFindFirst.mockResolvedValue(activeSession);

    await expect(startMealCheckSession("checker-1")).resolves.toBe(
      activeSession,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a session when the checker has no active session", async () => {
    sessionFindFirst.mockResolvedValue(null);
    insertReturning.mockResolvedValue([activeSession]);

    await expect(startMealCheckSession("checker-1")).resolves.toBe(
      activeSession,
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ checkerUserId: "checker-1" }),
    );
  });
});
