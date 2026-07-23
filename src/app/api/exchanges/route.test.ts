import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  findFirst,
  insert,
  values,
  onConflictDoNothing,
  returning,
  deliverInvitationEmail,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  findFirst: vi.fn(),
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

const body = {
  hostName: "Spoofed Client Name",
  counterpartName: "Julian Park",
  counterpartEmail: "JULIAN@Princeton.edu",
  location: "Cottage Club",
  mealType: "dinner",
  expiresAt: "2100-05-12T23:00:00.000Z",
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

describe("create exchange API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("links the host and snapshots their server-side display name", async () => {
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
      hostName: "Maya Hernandez",
      counterpartUserId: null,
      counterpartName: "Julian Park",
      counterpartEmail: "julian@princeton.edu",
      status: "pending",
    };
    findFirst.mockResolvedValueOnce(null).mockImplementationOnce(() => ({
      ...saved,
      requestFingerprint: values.mock.calls[0]?.[0].requestFingerprint,
    }));

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        hostUserId: "host-user-1",
        hostName: "Maya Hernandez",
        counterpartEmail: "julian@princeton.edu",
      }),
    );
    expect(values).not.toHaveBeenCalledWith(
      expect.objectContaining({ hostName: "Spoofed Client Name" }),
    );
  });
});
