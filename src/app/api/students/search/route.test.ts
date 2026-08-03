import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, select, from, where, limit } = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/db", () => ({ db: { select } }));

import { NextRequest } from "next/server";
import { GET } from "./route";

describe("student roster search API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      user: { id: "current-user", email: "current@princeton.edu" },
    });
    select.mockReturnValue({ from });
    from.mockReturnValue({ where });
    where.mockReturnValue({ limit });
    limit.mockResolvedValue([
      {
        id: "eligible-user",
        name: "Maya Hernandez",
        email: "maya@princeton.edu",
        eligible: true,
      },
      {
        id: "ineligible-user",
        name: "Taylor Morgan",
        email: "taylor@princeton.edu",
        eligible: false,
      },
    ]);
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("https://example.test/api/students/search?q=ma"),
    );

    expect(response.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns no results for a query shorter than two characters", async () => {
    const response = await GET(
      new NextRequest("https://example.test/api/students/search?q=m"),
    );

    expect(response.status).toBe(200);
    expect(select).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      students: [],
      source: "eligibility-roster",
    });
  });

  it("returns roster eligibility without hiding ineligible students", async () => {
    const response = await GET(
      new NextRequest("https://example.test/api/students/search?q=ma"),
    );

    expect(response.status).toBe(200);
    expect(limit).toHaveBeenCalledWith(8);
    expect(await response.json()).toEqual({
      students: [
        {
          id: "eligible-user",
          name: "Maya Hernandez",
          email: "maya@princeton.edu",
          eligible: true,
          eligibilityMessage: "Eligible for meal exchange",
        },
        {
          id: "ineligible-user",
          name: "Taylor Morgan",
          email: "taylor@princeton.edu",
          eligible: false,
          eligibilityMessage: "Eligibility not confirmed",
        },
      ],
      source: "eligibility-roster",
    });
  });
});
