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
import { fingerprintExchangeInput } from "@/lib/exchange";

const body = {
  counterpartId: "counterpart-user-1",
  establishmentId: "3ec6de13-73b7-4baa-8497-dce75c34f908",
  mealType: "dinner" as const,
  date: "2100-05-12",
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

function mockSelections({ initiatorEligible = true } = {}) {
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
                eligible: initiatorEligible,
                homeEstablishmentId: null,
              },
              {
                id: body.counterpartId,
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

const saved = {
  id: "3ec6de13-73b7-4baa-8497-dce75c34f908",
  hostUserId: "host-user-1",
  hostName: "Maya Hernandez",
  counterpartUserId: null,
  counterpartName: "Julian Park",
  counterpartEmail: "julian@princeton.edu",
  location: "Cottage Club",
  mealType: "dinner",
  exchangeDate: body.date,
  status: "pending",
  invitationEmailStatus: "pending",
};

describe("create exchange API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      user: {
        id: "host-user-1",
        name: "Maya Hernandez",
        email: "maya@princeton.edu",
      },
    });
    mockSelections();
    insert.mockReturnValue({ values });
    values.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockReturnValue({ returning });
    returning.mockResolvedValue([{ id: saved.id }]);
    deliverInvitationEmail.mockResolvedValue({ status: "sent" });
  });

  it("requires authentication before validating or inserting", async () => {
    getSession.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it("resolves eligibility, snapshots, and meal roles on the server", async () => {
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
        mealHostUserId: body.counterpartId,
        mealGuestUserId: "host-user-1",
        hostName: "Maya Hernandez",
        counterpartName: "Julian Park",
        counterpartEmail: "julian@princeton.edu",
        establishmentId: body.establishmentId,
        exchangeDate: body.date,
      }),
    );
    expect(values.mock.calls[0]?.[0]).not.toHaveProperty("counterpartUserId");
    expect(await response.json()).toMatchObject({
      exchange: {
        counterpartName: "Julian Park",
        locationName: "Cottage Club",
        date: body.date,
      },
    });
  });

  it("rejects an initiator whose roster eligibility is false", async () => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      user: { id: "host-user-1", name: "Maya", email: "maya@princeton.edu" },
    });
    mockSelections({ initiatorEligible: false });
    findFirst.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(422);
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns an existing idempotent exchange before mutable policy checks", async () => {
    findFirst.mockResolvedValue({
      ...saved,
      requestFingerprint: fingerprintExchangeInput(body),
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(select).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
