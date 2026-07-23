import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  getExchangeByToken,
  deliverConfirmationEmail,
  update,
  set,
  where,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getExchangeByToken: vi.fn(),
  deliverConfirmationEmail: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/db", () => ({ db: { update } }));
vi.mock("@/lib/exchange-service", () => ({
  appUrlFromRequest: () => "https://example.test",
  deliverConfirmationEmail,
  getExchangeByToken,
}));

import { POST } from "./route";

const acceptedExchange = {
  id: "3ec6de13-73b7-4baa-8497-dce75c34f908",
  counterpartUserId: "invitee",
  counterpartEmail: "invitee@princeton.edu",
  status: "accepted",
  expiresAt: new Date("2100-01-01T00:00:00.000Z"),
  barcodeValue: "ME-ABCD-EFGH-JKLM",
  confirmationEmailStatus: "sent",
};

const context = {
  params: Promise.resolve({ token: "private-token" }),
};

describe("accept exchange API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DEV_BYPASS_AUTH;
    getExchangeByToken.mockResolvedValue(acceptedExchange);
    update.mockReturnValue({ set });
    set.mockReturnValue({ where });
    where.mockResolvedValue(undefined);
  });

  it("requires a current user before mutating the exchange", async () => {
    getSession.mockResolvedValue(null);
    const response = await POST(
      new Request("https://example.test/api/exchanges/token/accept", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(401);
    expect(getExchangeByToken).toHaveBeenCalledWith("private-token");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a different current user before any mutation", async () => {
    getSession.mockResolvedValue({
      user: { id: "wrong-user", email: "other@princeton.edu" },
    });
    const response = await POST(
      new Request("https://example.test/api/exchanges/token/accept", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
    expect(deliverConfirmationEmail).not.toHaveBeenCalled();
  });

  it("uses the claimed user ID instead of a matching snapshot email", async () => {
    getSession.mockResolvedValue({
      user: { id: "different-user", email: "invitee@princeton.edu" },
    });

    const response = await POST(
      new Request("https://example.test/api/exchanges/token/accept", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("links the invited user while accepting a pending exchange", async () => {
    const pendingExchange = {
      ...acceptedExchange,
      counterpartUserId: null,
      status: "pending",
      confirmationEmailStatus: "pending",
    };
    const claimedExchange = {
      ...pendingExchange,
      counterpartUserId: "invitee",
      status: "accepted",
    };
    getExchangeByToken
      .mockResolvedValueOnce(pendingExchange)
      .mockResolvedValue(claimedExchange);
    getSession.mockResolvedValue({
      user: { id: "invitee", email: "INVITEE@princeton.edu" },
    });
    deliverConfirmationEmail.mockResolvedValue({ status: "sent" });

    const response = await POST(
      new Request("https://example.test/api/exchanges/token/accept", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        counterpartUserId: "invitee",
      }),
    );
  });

  it("allows the invited user and returns the stable barcode idempotently", async () => {
    getSession.mockResolvedValue({
      user: { id: "invitee", email: " INVITEE@Princeton.edu " },
    });
    const response = await POST(
      new Request("https://example.test/api/exchanges/token/accept", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "accepted",
      barcodeValue: acceptedExchange.barcodeValue,
      confirmationEmailStatus: "sent",
    });
    expect(update).not.toHaveBeenCalled();
    expect(deliverConfirmationEmail).not.toHaveBeenCalled();
  });

  it("can impersonate the invited user in an explicit development preview", async () => {
    process.env.DEV_BYPASS_AUTH = "true";
    getSession.mockResolvedValue(null);
    const response = await POST(
      new Request("https://example.test/api/exchanges/token/accept", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      status: "accepted",
      barcodeValue: acceptedExchange.barcodeValue,
    });
  });

  it("does not accept or resend an expired exchange", async () => {
    process.env.DEV_BYPASS_AUTH = "true";
    getExchangeByToken.mockResolvedValue({
      ...acceptedExchange,
      status: "pending",
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    const response = await POST(
      new Request("https://example.test/api/exchanges/token/accept", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(410);
    expect(update).not.toHaveBeenCalled();
    expect(deliverConfirmationEmail).not.toHaveBeenCalled();
  });
});
