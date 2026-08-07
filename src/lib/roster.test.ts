import { beforeAll, describe, expect, it } from "vitest";

type RosterModule = typeof import("./roster");
let parseAndValidateRoster: RosterModule["parseAndValidateRoster"];
let rosterChecksum: RosterModule["rosterChecksum"];

beforeAll(async () => {
  process.env.DATABASE_URL ??=
    "postgres://postgres:postgres@db.localtest.me:5432/main";
  ({ parseAndValidateRoster, rosterChecksum } = await import("./roster"));
});

describe("roster CSV validation", () => {
  it("normalizes a valid roster and defaults individual account types", () => {
    const result = parseAndValidateRoster(
      [
        "email,full_name,role,exchange_eligible,student_id,class_year",
        " OWNER@Example.COM ,Alex Owner,owner,false,,",
        "student@princeton.edu,Student Person,member,true,123456789,2028",
      ].join("\n"),
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        email: "owner@example.com",
        role: "owner",
        accountType: "person",
        exchangeEligible: false,
      }),
      expect.objectContaining({
        email: "student@princeton.edu",
        studentId: "123456789",
        classYear: 2028,
        exchangeEligible: true,
      }),
    ]);
  });

  it("supports commas and quotes in quoted names", () => {
    const result = parseAndValidateRoster(
      [
        "email,full_name,role,exchange_eligible",
        'owner@example.com,"Owner, Alex ""A""",owner,false',
      ].join("\n"),
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.fullName).toBe('Owner, Alex "A"');
  });

  it("enforces shared meal-checking account restrictions", () => {
    const result = parseAndValidateRoster(
      [
        "email,full_name,role,exchange_eligible,account_type",
        "owner@example.com,Owner,owner,false,person",
        "shared@example.com,Shared Checker,member,true,shared_meal_checking",
      ].join("\n"),
    );

    expect(result.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        "A shared meal-checking account must be an admin.",
        "A shared meal-checking account cannot be exchange-eligible.",
      ]),
    );
  });

  it("rejects duplicate emails and a roster without an owner", () => {
    const result = parseAndValidateRoster(
      [
        "email,full_name,role,exchange_eligible",
        "person@example.com,First Person,admin,false",
        "PERSON@example.com,Second Person,member,true",
      ].join("\n"),
    );

    expect(result.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        "This email appears more than once.",
        "Every club roster must contain at least one owner.",
      ]),
    );
  });

  it("rejects missing and unknown headers", () => {
    const result = parseAndValidateRoster(
      "email,full_name,role,unexpected\nowner@example.com,Owner,owner,value",
    );

    expect(result.errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        "Missing required column: exchange_eligible.",
        "Unknown column: unexpected.",
      ]),
    );
  });

  it("computes stable SHA-256 checksums", () => {
    expect(rosterChecksum("same roster")).toBe(rosterChecksum("same roster"));
    expect(rosterChecksum("same roster")).not.toBe(
      rosterChecksum("changed roster"),
    );
  });
});
