import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  findFirst,
  select,
  insert,
  values,
  onConflictDoNothing,
  returning,
  deliverInvitationEmail,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  findFirst: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  deliverInvitationEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/db", () => ({
  db: {
    query: { exchange: { findFirst } },
    select,
    insert,
  },
}));
vi.mock("@/lib/exchange-service", () => ({
  appUrlFromRequest: () => "https://example.test",
  deliverInvitationEmail,
  getExchangeDetailUrl: (id: string) =>
    `https://example.test/exchanges/token-for-${id}`,
}));

import { POST } from "./route";

const exchangeDate = new Date(Date.now() + 86_400_000)
  .toISOString()
  .slice(0, 10);
const body = {
  counterpartId: "counterpart-user-1",
  establishmentId: "3ec6de13-73b7-4baa-8497-dce75c34f908",
  mealType: "dinner",
  date: exchangeDate,
};

function request() {
  return new Request("https://example.test/api/exchanges", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "create-dinner-1",
    },
    body: JSON.stringify(body),
  });
}

function mockSelections() {
  let call = 0;
  select.mockImplementation(() => {
    const current = call++;
    return {
      from: () => ({
        where: () => {
          if (current === 0) {
            return Promise.resolve([
              {
                id: "host-user-1",
                name: "Maya Hernandez",
                email: "maya@princeton.edu",
                eligible: true,
                homeEstablishmentId: null,
              },
              {
                id: "counterpart-user-1",
                name: "Julian Park",
                email: "julian@princeton.edu",
                eligible: true,
                homeEstablishmentId: body.establishmentId,
              },
            ]);
          }
          if (current === 1) {
            return {
              limit: () =>
                Promise.resolve([
                  {
                    id: body.establishmentId,
                    name: "Cottage Club",
                    type: "eating_club",
                    isActive: true,
                  },
                ]),
            };
          }
          return Promise.resolve([{ value: 0 }]);
        },
      }),
    };
  });
}

describe("create exchange API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelections();
    insert.mockReturnValue({ values });
    values.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockReturnValue({ returning });
    returning.mockResolvedValue([
      { id: "3ec6de13-73b7-4baa-8497-dce75c34f908" },
    ]);
    deliverInvitationEmail.mockResolvedValue({ status: "sent" });
  });

  it("requires authentication before validating or inserting", async () => {
    getSession.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it("validates eligibility and derives the meal host from the location", async () => {
    getSession.mockResolvedValue({
      user: {
        id: "host-user-1",
        name: "Maya Hernandez",
        email: "maya@princeton.edu",
      },
    });
    const saved = {
      id: "3ec6de13-73b7-4baa-8497-dce75c34f908",
      hostUserId: "host-user-1",
      counterpartUserId: "counterpart-user-1",
      hostName: "Maya Hernandez",
      counterpartName: "Julian Park",
      counterpartEmail: "julian@princeton.edu",
      location: "Cottage Club",
      mealType: "dinner",
      exchangeDate,
      status: "pending",
    };
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => ({
        ...saved,
        requestFingerprint: values.mock.calls[0]?.[0].requestFingerprint,
      }));

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        hostUserId: "host-user-1",
        counterpartUserId: "counterpart-user-1",
        mealHostUserId: "counterpart-user-1",
        mealGuestUserId: "host-user-1",
        location: "Cottage Club",
        exchangeDate,
      }),
    );
  });

  it("rejects an ineligible participant before inserting", async () => {
    getSession.mockResolvedValue({
      user: {
        id: "host-user-1",
        name: "Maya Hernandez",
        email: "maya@princeton.edu",
      },
    });
    let call = 0;
    select.mockImplementation(() => {
      const current = call++;
      return {
        from: () => ({
          where: () =>
            current === 0
              ? Promise.resolve([
                  {
                    id: "host-user-1",
                    name: "Maya Hernandez",
                    email: "maya@princeton.edu",
                    eligible: false,
                    homeEstablishmentId: null,
                  },
                  {
                    id: "counterpart-user-1",
                    name: "Julian Park",
                    email: "julian@princeton.edu",
                    eligible: true,
                    homeEstablishmentId: null,
                  },
                ])
              : {
                  limit: () =>
                    Promise.resolve([
                      {
                        id: body.establishmentId,
                        name: "Cottage Club",
                        type: "eating_club",
                        isActive: true,
                      },
                    ]),
                },
        }),
      };
    });

    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(insert).not.toHaveBeenCalled();
  });
});
