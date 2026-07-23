import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, startMealCheckSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  startMealCheckSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/meal-checking", () => ({ startMealCheckSession }));

import { POST } from "./route";

describe("start meal-checking session API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startMealCheckSession.mockResolvedValue({
      id: "4f522db9-bc11-4a0d-a630-b17b0d8131e5",
      startedAt: new Date("2026-07-23T22:00:00.000Z"),
    });
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);
    const response = await POST(
      new Request("https://example.test/api/meal-checking/sessions", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(startMealCheckSession).not.toHaveBeenCalled();
  });

  it("starts or resumes a session for the authenticated user", async () => {
    getSession.mockResolvedValue({ user: { id: "checker-1" } });
    const response = await POST(
      new Request("https://example.test/api/meal-checking/sessions", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(startMealCheckSession).toHaveBeenCalledWith("checker-1");
  });
});
