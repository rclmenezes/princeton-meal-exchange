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
  isUserAllowed,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  isUserAllowed: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/roster-access", () => ({ isUserAllowed }));
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
  isDevelopmentOrganizationAdminBypassEnabled,
  isDevelopmentPlatformAdminBypassEnabled,
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
    isUserAllowed.mockResolvedValue(true);
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

  it("requires the base bypass and development mode for admin roles", () => {
    expect(
      isDevelopmentOrganizationAdminBypassEnabled(
        "development",
        "true",
        "true",
      ),
    ).toBe(true);
    expect(
      isDevelopmentPlatformAdminBypassEnabled("development", "true", "true"),
    ).toBe(true);
    expect(
      isDevelopmentOrganizationAdminBypassEnabled(
        "development",
        "false",
        "true",
      ),
    ).toBe(false);
    expect(
      isDevelopmentPlatformAdminBypassEnabled("production", "true", "true"),
    ).toBe(false);
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

  it("rejects a valid Better Auth session after roster access is removed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const user = {
      id: "removed-student",
      name: "Removed Student",
      email: "removed@princeton.edu",
    };
    getSession.mockResolvedValue({ user });
    isUserAllowed.mockResolvedValue(false);

    await expect(getAuthContext(new Headers())).resolves.toEqual({
      user: null,
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
