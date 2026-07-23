import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, endMealCheckSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  endMealCheckSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/meal-checking", () => ({ endMealCheckSession }));

import { POST } from "./route";

const id = "4f522db9-bc11-4a0d-a630-b17b0d8131e5";
const context = { params: Promise.resolve({ id }) };

describe("end meal-checking session API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "checker-1" } });
    endMealCheckSession.mockResolvedValue({ id, endedAt: new Date() });
  });

  it("ends only a session owned by the authenticated user", async () => {
    const response = await POST(
      new Request(`https://example.test/api/meal-checking/sessions/${id}/end`, {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(endMealCheckSession).toHaveBeenCalledWith(id, "checker-1");
  });

  it("does not expose another user's session", async () => {
    endMealCheckSession.mockResolvedValue(null);
    const response = await POST(
      new Request(`https://example.test/api/meal-checking/sessions/${id}/end`, {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(404);
  });
});
