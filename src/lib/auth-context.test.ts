import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  insert,
  values,
  onConflictDoNothing,
  select,
  from,
  where,
  limit,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/db", () => ({ db: { insert, select } }));
vi.mock("@/db/schema", () => ({
  establishment: { id: "establishment.id", name: "establishment.name" },
  user: { id: "user.id" },
}));

import {
  DEVELOPMENT_AUTH_USER,
  DEVELOPMENT_COUNTERPARTS,
  ensureDevelopmentAuthUser,
  getAuthContext,
  isDevelopmentAuthBypassEnabled,
} from "./auth-context";

describe("development auth bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockReturnValue({ values });
    values.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockResolvedValue(undefined);
    select.mockReturnValue({ from });
    from.mockReturnValue({ where });
    where.mockReturnValue({ limit });
    limit.mockResolvedValue([{ id: "cottage-id" }]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("can only be enabled in development", () => {
    expect(isDevelopmentAuthBypassEnabled("development", "true")).toBe(true);
    expect(isDevelopmentAuthBypassEnabled("test", "true")).toBe(false);
    expect(isDevelopmentAuthBypassEnabled("production", "true")).toBe(false);
    expect(isDevelopmentAuthBypassEnabled("development", "false")).toBe(false);
  });

  it("returns the fixed local identity without calling Better Auth", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_BYPASS_AUTH", "true");

    await expect(getAuthContext(new Headers())).resolves.toEqual({
      user: DEVELOPMENT_AUTH_USER,
      authBypassed: true,
    });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("uses Better Auth when the bypass is disabled", async () => {
    const user = {
      id: "student-1",
      name: "Maya Hernandez",
      email: "maya@princeton.edu",
    };
    getSession.mockResolvedValue({ user });

    await expect(getAuthContext(new Headers())).resolves.toEqual({
      user,
      authBypassed: false,
    });
  });

  it("seeds the development identity for foreign-key-backed flows", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_BYPASS_AUTH", "true");

    await ensureDevelopmentAuthUser();

    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({
        ...DEVELOPMENT_AUTH_USER,
        emailVerified: true,
        isExchangeEligible: true,
      }),
      expect.objectContaining({
        id: DEVELOPMENT_COUNTERPARTS[0].id,
        homeEstablishmentId: "cottage-id",
        isExchangeEligible: true,
      }),
      expect.objectContaining({
        id: DEVELOPMENT_COUNTERPARTS[1].id,
        homeEstablishmentId: null,
        isExchangeEligible: false,
      }),
    ]);
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });
});
