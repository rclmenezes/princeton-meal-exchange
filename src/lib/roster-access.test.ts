import { beforeAll, afterEach, describe, expect, it } from "vitest";

let normalizeEmail: (typeof import("./roster-access"))["normalizeEmail"];
let isPlatformAdminEmail: (typeof import("./roster-access"))["isPlatformAdminEmail"];

beforeAll(async () => {
  process.env.DATABASE_URL ??=
    "postgres://postgres:postgres@db.localtest.me:5432/main";
  ({ normalizeEmail, isPlatformAdminEmail } = await import("./roster-access"));
});

afterEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

describe("roster access identity", () => {
  it("normalizes email case and surrounding whitespace", () => {
    expect(normalizeEmail("  Alex.Owner@Example.COM ")).toBe(
      "alex.owner@example.com",
    );
  });

  it("matches platform administrator configuration case-insensitively", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "first@example.com, ADMIN@Example.com ";
    expect(isPlatformAdminEmail("admin@example.COM")).toBe(true);
    expect(isPlatformAdminEmail("student@example.com")).toBe(false);
  });
});
