import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, checkInExchange, MealCheckErrorMock } = vi.hoisted(() => {
  class TestMealCheckError extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    getSession: vi.fn(),
    checkInExchange: vi.fn(),
    MealCheckErrorMock: TestMealCheckError,
  };
});

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/meal-checking", () => ({
  checkInExchange,
  MealCheckError: MealCheckErrorMock,
}));

import { MealCheckError } from "@/lib/meal-checking";
import { POST } from "./route";

const sessionId = "4f522db9-bc11-4a0d-a630-b17b0d8131e5";

function request(body: unknown) {
  return new Request("https://example.test/api/meal-checking/check-ins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("meal check-in API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      user: { id: "checker-1", name: "Eli Bernstein" },
    });
    checkInExchange.mockResolvedValue({
      id: "exchange-1",
      guestName: "Julian Park",
      mealType: "dinner",
      completedAt: new Date("2026-07-23T22:00:00.000Z"),
    });
  });

  it("requires authentication before validating a code", async () => {
    getSession.mockResolvedValue(null);
    const response = await POST(
      request({ sessionId, code: "ME-ABCD-EFGH-JKLM" }),
    );

    expect(response.status).toBe(401);
    expect(checkInExchange).not.toHaveBeenCalled();
  });

  it("uses the authenticated user rather than a client-supplied checker", async () => {
    const response = await POST(
      request({
        sessionId,
        code: "ME-ABCD-EFGH-JKLM",
        checkerUserId: "spoofed-user",
      }),
    );

    expect(response.status).toBe(200);
    expect(checkInExchange).toHaveBeenCalledWith({
      sessionId,
      code: "ME-ABCD-EFGH-JKLM",
      checkerUserId: "checker-1",
    });
    expect(await response.json()).toMatchObject({
      guestName: "Julian Park",
      mealType: "dinner",
    });
  });

  it("returns a friendly conflict reason from validation", async () => {
    checkInExchange.mockRejectedValue(
      new MealCheckError(
        "already_completed",
        "This exchange has already been checked in.",
      ),
    );

    const response = await POST(
      request({ sessionId, code: "ME-ABCD-EFGH-JKLM" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This exchange has already been checked in.",
      reason: "already_completed",
    });
  });
});
