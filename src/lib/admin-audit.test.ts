import { afterEach, beforeAll, describe, expect, it } from "vitest";

let hasValidMutationOrigin: (typeof import("./admin-audit"))["hasValidMutationOrigin"];

beforeAll(async () => {
  process.env.DATABASE_URL ??=
    "postgres://postgres:postgres@db.localtest.me:5432/main";
  ({ hasValidMutationOrigin } = await import("./admin-audit"));
});

afterEach(() => {
  delete process.env.BETTER_AUTH_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("admin mutation origin checks", () => {
  it("accepts same-origin mutations", () => {
    const request = new Request(
      "https://meal.exchange/api/admin/rosters/apply",
      {
        method: "POST",
        headers: { origin: "https://meal.exchange" },
      },
    );
    expect(hasValidMutationOrigin(request)).toBe(true);
  });

  it("rejects cross-origin mutations", () => {
    const request = new Request(
      "https://meal.exchange/api/admin/rosters/apply",
      {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      },
    );
    expect(hasValidMutationOrigin(request)).toBe(false);
  });

  it("accepts a configured application origin behind a proxy", () => {
    process.env.BETTER_AUTH_URL = "https://meal.exchange";
    const request = new Request(
      "http://internal:3000/api/admin/rosters/apply",
      {
        method: "POST",
        headers: { origin: "https://meal.exchange" },
      },
    );
    expect(hasValidMutationOrigin(request)).toBe(true);
  });
});
