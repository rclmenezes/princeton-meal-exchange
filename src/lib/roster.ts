import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  accessNotification,
  establishment,
  member,
  rosterEntry,
  rosterIngest,
  session,
  user,
} from "@/db/schema";
import { synchronizeUsersByEmail } from "@/lib/access-provisioning";
import { sendEmail } from "@/lib/email";
import {
  getEmailAccess,
  isPlatformAdminEmail,
  normalizeEmail,
} from "@/lib/roster-access";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

export const MAX_ROSTER_BYTES = 2 * 1024 * 1024;
export const REQUIRED_ROSTER_HEADERS = [
  "email",
  "full_name",
  "role",
  "exchange_eligible",
] as const;
export const OPTIONAL_ROSTER_HEADERS = [
  "student_id",
  "class_year",
  "account_type",
] as const;

export type RosterRole = "owner" | "admin" | "member";
export type RosterAccountType = "person" | "shared_meal_checking";

export type NormalizedRosterRow = {
  rowNumber: number;
  email: string;
  fullName: string;
  role: RosterRole;
  exchangeEligible: boolean;
  studentId: string | null;
  classYear: number | null;
  accountType: RosterAccountType;
};

export type RosterValidationError = {
  row: number | null;
  field: string | null;
  message: string;
};

export type RosterDiff = {
  additions: NormalizedRosterRow[];
  updates: NormalizedRosterRow[];
  removals: Array<{
    id: string;
    email: string;
    fullName: string;
    role: RosterRole;
  }>;
};

export type RosterPreview = {
  checksum: string;
  rosterVersion: number;
  establishmentId: string;
  establishmentName: string;
  rows: NormalizedRosterRow[];
  errors: RosterValidationError[];
  warnings: string[];
  counts: {
    total: number;
    additions: number;
    updates: number;
    removals: number;
  };
  diff: RosterDiff;
};

function parseCsvRecords(input: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      record.push(value);
      value = "";
    } else if (character === "\n") {
      record.push(value.replace(/\r$/, ""));
      records.push(record);
      record = [];
      value = "";
    } else value += character;
  }

  if (quoted) throw new Error("The CSV contains an unterminated quoted field.");
  if (value.length > 0 || record.length > 0) {
    record.push(value.replace(/\r$/, ""));
    records.push(record);
  }
  return records.filter((row) => row.some((cell) => cell.trim() !== ""));
}

export function rosterChecksum(contents: string) {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function rowEqualsExisting(
  row: NormalizedRosterRow,
  existing: typeof rosterEntry.$inferSelect,
) {
  return (
    row.fullName === existing.fullName &&
    row.role === existing.role &&
    row.exchangeEligible === existing.exchangeEligible &&
    row.studentId === existing.studentId &&
    row.classYear === existing.classYear &&
    row.accountType === existing.accountType
  );
}

export function parseAndValidateRoster(contents: string) {
  const errors: RosterValidationError[] = [];
  const rows: NormalizedRosterRow[] = [];
  let records: string[][];
  try {
    records = parseCsvRecords(contents.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      rows,
      errors: [
        {
          row: null,
          field: null,
          message: error instanceof Error ? error.message : "Invalid CSV.",
        },
      ],
    };
  }

  if (records.length === 0) {
    return {
      rows,
      errors: [{ row: null, field: null, message: "The CSV file is empty." }],
    };
  }

  const headers = records[0].map((header) => header.trim().toLowerCase());
  const accepted = new Set([
    ...REQUIRED_ROSTER_HEADERS,
    ...OPTIONAL_ROSTER_HEADERS,
  ]);
  for (const required of REQUIRED_ROSTER_HEADERS) {
    if (!headers.includes(required)) {
      errors.push({
        row: 1,
        field: required,
        message: `Missing required column: ${required}.`,
      });
    }
  }
  headers.forEach((header, index) => {
    if (!header) {
      errors.push({
        row: 1,
        field: null,
        message: `Column ${index + 1} has no header.`,
      });
    } else if (
      !accepted.has(header as (typeof REQUIRED_ROSTER_HEADERS)[number])
    ) {
      errors.push({
        row: 1,
        field: header,
        message: `Unknown column: ${header}.`,
      });
    } else if (headers.indexOf(header) !== index) {
      errors.push({
        row: 1,
        field: header,
        message: `Duplicate column: ${header}.`,
      });
    }
  });
  if (errors.length > 0) return { rows, errors };

  const seenEmails = new Set<string>();
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const cell = (record: string[], header: string) =>
    record[headerIndex.get(header) ?? -1]?.trim() ?? "";

  records.slice(1).forEach((record, recordIndex) => {
    const rowNumber = recordIndex + 2;
    const email = normalizeEmail(cell(record, "email"));
    const fullName = cell(record, "full_name");
    const role = cell(record, "role").toLowerCase();
    const eligibility = cell(record, "exchange_eligible").toLowerCase();
    const studentId = cell(record, "student_id") || null;
    const classYearValue = cell(record, "class_year");
    const accountType = (
      cell(record, "account_type") || "person"
    ).toLowerCase();
    const rowErrors: RosterValidationError[] = [];

    if (!isEmail(email))
      rowErrors.push({
        row: rowNumber,
        field: "email",
        message: "Enter a valid email address.",
      });
    else if (seenEmails.has(email))
      rowErrors.push({
        row: rowNumber,
        field: "email",
        message: "This email appears more than once.",
      });
    else seenEmails.add(email);

    if (!fullName || fullName.length > 200)
      rowErrors.push({
        row: rowNumber,
        field: "full_name",
        message: "Full name must contain 1–200 characters.",
      });
    if (role !== "owner" && role !== "admin" && role !== "member")
      rowErrors.push({
        row: rowNumber,
        field: "role",
        message: "Role must be owner, admin, or member.",
      });
    if (eligibility !== "true" && eligibility !== "false")
      rowErrors.push({
        row: rowNumber,
        field: "exchange_eligible",
        message: "Exchange eligibility must be true or false.",
      });
    if (accountType !== "person" && accountType !== "shared_meal_checking")
      rowErrors.push({
        row: rowNumber,
        field: "account_type",
        message: "Account type must be person or shared_meal_checking.",
      });

    const classYear = classYearValue ? Number(classYearValue) : null;
    if (
      classYearValue &&
      (!Number.isInteger(classYear) || classYear! < 2000 || classYear! > 2100)
    )
      rowErrors.push({
        row: rowNumber,
        field: "class_year",
        message: "Class year must be a four-digit year.",
      });

    if (accountType === "shared_meal_checking") {
      if (role !== "admin")
        rowErrors.push({
          row: rowNumber,
          field: "role",
          message: "A shared meal-checking account must be an admin.",
        });
      if (eligibility !== "false")
        rowErrors.push({
          row: rowNumber,
          field: "exchange_eligible",
          message:
            "A shared meal-checking account cannot be exchange-eligible.",
        });
      if (studentId || classYearValue)
        rowErrors.push({
          row: rowNumber,
          field: "account_type",
          message: "A shared meal-checking account cannot have student fields.",
        });
    }

    errors.push(...rowErrors);
    if (rowErrors.length === 0) {
      rows.push({
        rowNumber,
        email,
        fullName,
        role: role as RosterRole,
        exchangeEligible: eligibility === "true",
        studentId,
        classYear,
        accountType: accountType as RosterAccountType,
      });
    }
  });

  if (rows.filter((row) => row.role === "owner").length === 0) {
    errors.push({
      row: null,
      field: "role",
      message: "Every club roster must contain at least one owner.",
    });
  }
  if (
    rows.filter((row) => row.accountType === "shared_meal_checking").length > 1
  ) {
    errors.push({
      row: null,
      field: "account_type",
      message: "A club can have only one shared meal-checking account.",
    });
  }

  return { rows, errors };
}

export async function previewRoster(
  contents: string,
  establishmentId: string,
): Promise<RosterPreview> {
  const parsed = parseAndValidateRoster(contents);
  const clubs = await db
    .select({
      id: establishment.id,
      name: establishment.name,
      type: establishment.type,
      organizationId: establishment.organizationId,
      rosterVersion: establishment.rosterVersion,
    })
    .from(establishment)
    .where(eq(establishment.id, establishmentId))
    .limit(1);
  const club = clubs[0];
  if (!club || club.type !== "eating_club") {
    throw new Error("Eating club not found.");
  }

  const current = await db
    .select()
    .from(rosterEntry)
    .where(
      and(
        eq(rosterEntry.establishmentId, establishmentId),
        eq(rosterEntry.active, true),
      ),
    );
  const errors = [...parsed.errors];
  for (const row of parsed.rows) {
    if (
      row.accountType === "shared_meal_checking" &&
      isPlatformAdminEmail(row.email)
    ) {
      errors.push({
        row: row.rowNumber,
        field: "email",
        message:
          "A configured platform-administrator email cannot be used as the shared meal-checking account.",
      });
    }
  }
  const incomingEmails = parsed.rows.map((row) => row.email);
  if (incomingEmails.length > 0) {
    const conflicts = await db
      .select({
        email: rosterEntry.email,
        establishmentName: establishment.name,
      })
      .from(rosterEntry)
      .innerJoin(
        establishment,
        eq(establishment.id, rosterEntry.establishmentId),
      )
      .where(
        and(
          inArray(rosterEntry.email, incomingEmails),
          eq(rosterEntry.active, true),
          ne(rosterEntry.establishmentId, establishmentId),
        ),
      );
    for (const conflict of conflicts) {
      errors.push({
        row:
          parsed.rows.find((row) => row.email === conflict.email)?.rowNumber ??
          null,
        field: "email",
        message: `${conflict.email} is already affiliated with ${conflict.establishmentName}.`,
      });
    }
  }

  if (club.organizationId) {
    const effectiveOwners = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, club.organizationId),
          eq(member.role, "owner"),
        ),
      );
    const currentOwnerEmails = effectiveOwners
      .map((owner) => owner.email)
      .sort();
    const incomingOwnerEmails = parsed.rows
      .filter((row) => row.role === "owner")
      .map((row) => row.email)
      .sort();
    if (
      currentOwnerEmails.length > 0 &&
      currentOwnerEmails.join("|") !== incomingOwnerEmails.join("|")
    ) {
      errors.push({
        row: null,
        field: "role",
        message:
          "CSV uploads cannot change established ownership. Use the owner-transfer control first.",
      });
    }
  }

  const currentByEmail = new Map(current.map((entry) => [entry.email, entry]));
  const incomingByEmail = new Map(parsed.rows.map((row) => [row.email, row]));
  const additions = parsed.rows.filter((row) => !currentByEmail.has(row.email));
  const updates = parsed.rows.filter((row) => {
    const existing = currentByEmail.get(row.email);
    return existing ? !rowEqualsExisting(row, existing) : false;
  });
  const removals = current
    .filter((entry) => !incomingByEmail.has(entry.email))
    .map((entry) => ({
      id: entry.id,
      email: entry.email,
      fullName: entry.fullName,
      role: entry.role,
    }));

  return {
    checksum: rosterChecksum(contents),
    rosterVersion: club.rosterVersion,
    establishmentId: club.id,
    establishmentName: club.name,
    rows: parsed.rows,
    errors,
    warnings: removals.length
      ? [
          `${removals.length} existing roster entr${removals.length === 1 ? "y" : "ies"} will be deactivated.`,
        ]
      : [],
    counts: {
      total: parsed.rows.length,
      additions: additions.length,
      updates: updates.length,
      removals: removals.length,
    },
    diff: { additions, updates, removals },
  };
}

async function notifyRemovedUsers(
  emails: string[],
  establishmentId: string,
  rosterVersion: number,
) {
  for (const email of emails) {
    const access = await getEmailAccess(email);
    if (access.allowed) continue;

    const accounts = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    const account = accounts[0];
    if (!account) continue;
    const idempotencyKey = `access-removal/${account.id}/${establishmentId}/${rosterVersion}`;
    const pending = await db
      .insert(accessNotification)
      .values({
        userId: account.id,
        email: account.email,
        kind: "access_removed",
        idempotencyKey,
      })
      .onConflictDoNothing()
      .returning({ id: accessNotification.id });
    if (!pending[0]) continue;

    try {
      await db
        .update(accessNotification)
        .set({ status: "sending" })
        .where(eq(accessNotification.id, pending[0].id));
      const result = await sendEmail({
        to: account.email,
        subject: "Your Princeton Meal Exchange access changed",
        text: [
          "Your email is no longer included in an active Princeton Meal Exchange roster.",
          "Your active sessions have been signed out, and you cannot sign in again unless an administrator restores access.",
          "If you believe this is a mistake, contact your eating club or the Meal Exchange platform team.",
        ].join("\n\n"),
        idempotencyKey,
      });
      await db
        .update(accessNotification)
        .set({
          status: "sent",
          providerId: result?.id ?? null,
          sentAt: new Date(),
        })
        .where(eq(accessNotification.id, pending[0].id));
    } catch (error) {
      await db
        .update(accessNotification)
        .set({
          status: "failed",
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Unknown email error",
        })
        .where(eq(accessNotification.id, pending[0].id));
    }
  }
}

export async function applyRoster(input: {
  contents: string;
  filename: string;
  checksum: string;
  rosterVersion: number;
  establishmentId: string;
  uploaderUserId: string;
}) {
  const preview = await previewRoster(input.contents, input.establishmentId);
  if (preview.checksum !== input.checksum) {
    throw new RosterApplyError(
      "The file changed after preview. Preview it again.",
      409,
    );
  }
  if (preview.rosterVersion !== input.rosterVersion) {
    throw new RosterApplyError(
      "The roster changed after preview. Preview it again.",
      409,
    );
  }
  if (preview.errors.length > 0) {
    throw new RosterApplyError("The roster still has validation errors.", 422);
  }

  const affectedEmails = [
    ...preview.rows.map((row) => row.email),
    ...preview.diff.removals.map((row) => row.email),
  ];
  const newVersion = input.rosterVersion + 1;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${establishment.id} from ${establishment} where ${establishment.id} = ${input.establishmentId} for update`,
    );
    const current = await tx
      .select({
        rosterVersion: establishment.rosterVersion,
        organizationId: establishment.organizationId,
      })
      .from(establishment)
      .where(eq(establishment.id, input.establishmentId))
      .limit(1);
    if (current[0]?.rosterVersion !== input.rosterVersion) {
      throw new RosterApplyError(
        "The roster changed after preview. Preview it again.",
        409,
      );
    }

    await tx
      .update(rosterEntry)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(rosterEntry.establishmentId, input.establishmentId),
          eq(rosterEntry.active, true),
        ),
      );
    if (preview.rows.length > 0) {
      await tx.insert(rosterEntry).values(
        preview.rows.map((row) => ({
          email: row.email,
          fullName: row.fullName,
          source: "club",
          establishmentId: input.establishmentId,
          role: row.role,
          accountType: row.accountType,
          exchangeEligible: row.exchangeEligible,
          studentId: row.studentId,
          classYear: row.classYear,
        })),
      );
    }

    const registeredAccounts = affectedEmails.length
      ? await tx
          .select({ id: user.id, email: user.email, name: user.name })
          .from(user)
          .where(inArray(user.email, affectedEmails))
      : [];
    const incomingByEmail = new Map(
      preview.rows.map((row) => [row.email, row]),
    );
    for (const account of registeredAccounts) {
      const incoming = incomingByEmail.get(account.email);
      if (incoming) {
        await tx
          .update(rosterEntry)
          .set({ linkedUserId: account.id, updatedAt: new Date() })
          .where(
            and(
              eq(rosterEntry.establishmentId, input.establishmentId),
              eq(rosterEntry.email, account.email),
              eq(rosterEntry.active, true),
            ),
          );
        await tx
          .update(user)
          .set({
            name: incoming.fullName,
            accountType: incoming.accountType,
            studentId: incoming.studentId,
            classYear: incoming.classYear,
            homeEstablishmentId: input.establishmentId,
            isExchangeEligible: incoming.exchangeEligible,
            eligibilityUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(user.id, account.id));
        if (current[0].organizationId) {
          await tx
            .insert(member)
            .values({
              id: randomUUID(),
              organizationId: current[0].organizationId,
              userId: account.id,
              role: incoming.role,
            })
            .onConflictDoUpdate({
              target: [member.organizationId, member.userId],
              set: { role: incoming.role },
            });
          await tx
            .update(session)
            .set({ activeOrganizationId: current[0].organizationId })
            .where(eq(session.userId, account.id));
        }
      } else {
        if (current[0].organizationId) {
          await tx
            .delete(member)
            .where(
              and(
                eq(member.organizationId, current[0].organizationId),
                eq(member.userId, account.id),
              ),
            );
        }
        await tx
          .update(session)
          .set({ activeOrganizationId: null })
          .where(eq(session.userId, account.id));
        const alternateSources = await tx
          .select({ id: rosterEntry.id })
          .from(rosterEntry)
          .where(
            and(
              eq(rosterEntry.email, account.email),
              eq(rosterEntry.active, true),
            ),
          )
          .limit(1);
        if (
          alternateSources.length === 0 &&
          !isPlatformAdminEmail(account.email)
        ) {
          await tx.delete(session).where(eq(session.userId, account.id));
          await tx
            .update(user)
            .set({
              role: "user",
              homeEstablishmentId: null,
              isExchangeEligible: false,
              eligibilityUpdatedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(user.id, account.id));
        }
      }
    }
    await tx
      .update(establishment)
      .set({ rosterVersion: newVersion })
      .where(eq(establishment.id, input.establishmentId));
    await tx.insert(rosterIngest).values({
      uploaderUserId: input.uploaderUserId,
      establishmentId: input.establishmentId,
      filename: input.filename,
      checksum: input.checksum,
      baseRosterVersion: input.rosterVersion,
      addedCount: preview.counts.additions,
      updatedCount: preview.counts.updates,
      removedCount: preview.counts.removals,
      outcome: "applied",
      appliedAt: new Date(),
    });
  });

  await synchronizeUsersByEmail(affectedEmails);
  await notifyRemovedUsers(
    preview.diff.removals.map((row) => row.email),
    input.establishmentId,
    newVersion,
  );

  return {
    rosterVersion: newVersion,
    counts: preview.counts,
  };
}

export type ManualRosterInput = {
  email: string;
  fullName: string;
  role: RosterRole;
  exchangeEligible: boolean;
  studentId?: string | null;
  classYear?: number | null;
  accountType?: RosterAccountType;
};

function validateManualInput(input: ManualRosterInput) {
  const errors: string[] = [];
  const email = normalizeEmail(input.email);
  const accountType = input.accountType ?? "person";
  if (!isEmail(email)) errors.push("Enter a valid email address.");
  if (!input.fullName.trim() || input.fullName.trim().length > 200)
    errors.push("Full name must contain 1–200 characters.");
  if (!(["owner", "admin", "member"] as string[]).includes(input.role))
    errors.push("Choose a valid organization role.");
  if (accountType === "shared_meal_checking") {
    if (isPlatformAdminEmail(email))
      errors.push(
        "A configured platform-administrator email cannot be used as the shared meal-checking account.",
      );
    if (input.role !== "admin")
      errors.push("A shared meal-checking account must be an admin.");
    if (input.exchangeEligible)
      errors.push(
        "A shared meal-checking account cannot be exchange-eligible.",
      );
    if (input.studentId || input.classYear)
      errors.push("A shared meal-checking account cannot have student fields.");
  }
  if (
    input.classYear !== null &&
    input.classYear !== undefined &&
    (!Number.isInteger(input.classYear) ||
      input.classYear < 2000 ||
      input.classYear > 2100)
  )
    errors.push("Class year must be a four-digit year.");
  if (errors.length > 0) throw new RosterApplyError(errors.join(" "), 422);
  return {
    ...input,
    email,
    fullName: input.fullName.trim(),
    accountType,
    studentId: input.studentId?.trim() || null,
    classYear: input.classYear ?? null,
  };
}

export async function createManualRosterEntry(
  establishmentId: string,
  input: ManualRosterInput,
) {
  const value = validateManualInput(input);
  const conflicts = await db
    .select({ id: rosterEntry.id })
    .from(rosterEntry)
    .where(
      and(eq(rosterEntry.email, value.email), eq(rosterEntry.active, true)),
    )
    .limit(1);
  if (conflicts[0]) {
    throw new RosterApplyError(
      "That email already has an active roster entry.",
      409,
    );
  }

  const inserted = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${establishment.id} from ${establishment} where ${establishment.id} = ${establishmentId} for update`,
    );
    const clubs = await tx
      .select({
        type: establishment.type,
        organizationId: establishment.organizationId,
        rosterVersion: establishment.rosterVersion,
      })
      .from(establishment)
      .where(eq(establishment.id, establishmentId))
      .limit(1);
    if (!clubs[0] || clubs[0].type !== "eating_club") {
      throw new RosterApplyError("Eating club not found.", 404);
    }
    if (value.role === "owner" && clubs[0].organizationId) {
      throw new RosterApplyError(
        "Use the owner-transfer control for an active organization.",
        422,
      );
    }
    const rows = await tx
      .insert(rosterEntry)
      .values({
        ...value,
        source: "club",
        establishmentId,
      })
      .returning({ id: rosterEntry.id });
    await tx
      .update(establishment)
      .set({ rosterVersion: clubs[0].rosterVersion + 1 })
      .where(eq(establishment.id, establishmentId));
    return rows[0];
  });

  await synchronizeUsersByEmail([value.email]);
  return inserted;
}

export async function updateManualRosterEntry(
  establishmentId: string,
  entryId: string,
  input: Omit<ManualRosterInput, "email" | "accountType">,
) {
  const existingRows = await db
    .select()
    .from(rosterEntry)
    .where(
      and(
        eq(rosterEntry.id, entryId),
        eq(rosterEntry.establishmentId, establishmentId),
        eq(rosterEntry.active, true),
      ),
    )
    .limit(1);
  const existing = existingRows[0];
  if (!existing) throw new RosterApplyError("Roster entry not found.", 404);
  if (existing.role === "owner" || input.role === "owner") {
    throw new RosterApplyError(
      "Use the owner-transfer control to change ownership.",
      422,
    );
  }
  const value = validateManualInput({
    ...input,
    email: existing.email,
    accountType: existing.accountType,
  });

  await db.transaction(async (tx) => {
    const clubs = await tx
      .select({ organizationId: establishment.organizationId })
      .from(establishment)
      .where(eq(establishment.id, establishmentId))
      .limit(1);
    await tx
      .update(rosterEntry)
      .set({
        fullName: value.fullName,
        role: value.role,
        exchangeEligible: value.exchangeEligible,
        studentId: value.studentId,
        classYear: value.classYear,
        updatedAt: new Date(),
      })
      .where(eq(rosterEntry.id, entryId));
    if (existing.linkedUserId) {
      await tx
        .update(user)
        .set({
          name: value.fullName,
          studentId: value.studentId,
          classYear: value.classYear,
          isExchangeEligible: value.exchangeEligible,
          eligibilityUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(user.id, existing.linkedUserId));
      if (clubs[0]?.organizationId) {
        await tx
          .update(member)
          .set({ role: value.role })
          .where(
            and(
              eq(member.organizationId, clubs[0].organizationId),
              eq(member.userId, existing.linkedUserId),
            ),
          );
      }
    }
    await tx
      .update(establishment)
      .set({ rosterVersion: sql`${establishment.rosterVersion} + 1` })
      .where(eq(establishment.id, establishmentId));
  });
  await synchronizeUsersByEmail([existing.email]);
}

export async function deactivateManualRosterEntry(
  establishmentId: string,
  entryId: string,
) {
  const existingRows = await db
    .select()
    .from(rosterEntry)
    .where(
      and(
        eq(rosterEntry.id, entryId),
        eq(rosterEntry.establishmentId, establishmentId),
        eq(rosterEntry.active, true),
      ),
    )
    .limit(1);
  const existing = existingRows[0];
  if (!existing) throw new RosterApplyError("Roster entry not found.", 404);
  if (existing.role === "owner") {
    throw new RosterApplyError(
      "Transfer ownership before deactivating this owner.",
      422,
    );
  }

  const newVersion = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${establishment.id} from ${establishment} where ${establishment.id} = ${establishmentId} for update`,
    );
    const clubs = await tx
      .select({
        rosterVersion: establishment.rosterVersion,
        organizationId: establishment.organizationId,
      })
      .from(establishment)
      .where(eq(establishment.id, establishmentId))
      .limit(1);
    if (!clubs[0]) throw new RosterApplyError("Eating club not found.", 404);
    await tx
      .update(rosterEntry)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(rosterEntry.id, entryId));
    if (existing.linkedUserId) {
      if (clubs[0].organizationId) {
        await tx
          .delete(member)
          .where(
            and(
              eq(member.organizationId, clubs[0].organizationId),
              eq(member.userId, existing.linkedUserId),
            ),
          );
      }
      const alternateSources = await tx
        .select({ id: rosterEntry.id })
        .from(rosterEntry)
        .where(
          and(
            eq(rosterEntry.email, existing.email),
            eq(rosterEntry.active, true),
          ),
        )
        .limit(1);
      if (
        alternateSources.length === 0 &&
        !isPlatformAdminEmail(existing.email)
      ) {
        await tx
          .delete(session)
          .where(eq(session.userId, existing.linkedUserId));
        await tx
          .update(user)
          .set({
            role: "user",
            homeEstablishmentId: null,
            isExchangeEligible: false,
            eligibilityUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(user.id, existing.linkedUserId));
      }
    }
    await tx
      .update(establishment)
      .set({ rosterVersion: clubs[0].rosterVersion + 1 })
      .where(eq(establishment.id, establishmentId));
    return clubs[0].rosterVersion + 1;
  });
  await synchronizeUsersByEmail([existing.email]);
  await notifyRemovedUsers([existing.email], establishmentId, newVersion);
}

export async function transferOrganizationOwner(input: {
  establishmentId: string;
  actorUserId: string;
  targetEntryId: string;
  platformAdmin: boolean;
}) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${establishment.id} from ${establishment} where ${establishment.id} = ${input.establishmentId} for update`,
    );
    const clubs = await tx
      .select({
        organizationId: establishment.organizationId,
        rosterVersion: establishment.rosterVersion,
      })
      .from(establishment)
      .where(eq(establishment.id, input.establishmentId))
      .limit(1);
    const club = clubs[0];
    if (!club?.organizationId)
      throw new RosterApplyError("The organization is not active yet.", 409);

    const targets = await tx
      .select({
        entryId: rosterEntry.id,
        userId: rosterEntry.linkedUserId,
        role: rosterEntry.role,
        accountType: rosterEntry.accountType,
      })
      .from(rosterEntry)
      .where(
        and(
          eq(rosterEntry.id, input.targetEntryId),
          eq(rosterEntry.establishmentId, input.establishmentId),
          eq(rosterEntry.active, true),
        ),
      )
      .limit(1);
    const target = targets[0];
    if (!target?.userId)
      throw new RosterApplyError(
        "The new owner must sign in before ownership can be transferred.",
        422,
      );
    if (target.role === "owner")
      throw new RosterApplyError("That person is already an owner.", 409);
    if (target.accountType === "shared_meal_checking")
      throw new RosterApplyError(
        "A shared meal-checking account cannot become an owner.",
        422,
      );

    let outgoingUserId = input.actorUserId;
    const actorMembership = await tx
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, club.organizationId),
          eq(member.userId, input.actorUserId),
        ),
      )
      .limit(1);
    if (actorMembership[0]?.role !== "owner") {
      if (!input.platformAdmin)
        throw new RosterApplyError(
          "Only an owner can transfer ownership.",
          403,
        );
      const owners = await tx
        .select({ userId: member.userId })
        .from(member)
        .where(
          and(
            eq(member.organizationId, club.organizationId),
            eq(member.role, "owner"),
          ),
        )
        .limit(1);
      if (!owners[0])
        throw new RosterApplyError("No current owner was found.", 409);
      outgoingUserId = owners[0].userId;
    }

    await tx
      .update(member)
      .set({ role: "admin" })
      .where(
        and(
          eq(member.organizationId, club.organizationId),
          eq(member.userId, outgoingUserId),
        ),
      );
    await tx
      .update(rosterEntry)
      .set({ role: "admin", updatedAt: new Date() })
      .where(
        and(
          eq(rosterEntry.linkedUserId, outgoingUserId),
          eq(rosterEntry.establishmentId, input.establishmentId),
          eq(rosterEntry.active, true),
        ),
      );
    await tx
      .update(member)
      .set({ role: "owner" })
      .where(
        and(
          eq(member.organizationId, club.organizationId),
          eq(member.userId, target.userId),
        ),
      );
    await tx
      .update(rosterEntry)
      .set({ role: "owner", updatedAt: new Date() })
      .where(eq(rosterEntry.id, target.entryId));
    await tx
      .update(establishment)
      .set({ rosterVersion: club.rosterVersion + 1 })
      .where(eq(establishment.id, input.establishmentId));
  });
}

export async function replaceSharedAccount(
  establishmentId: string,
  input: { email: string; fullName: string },
) {
  const value = validateManualInput({
    ...input,
    role: "admin",
    exchangeEligible: false,
    accountType: "shared_meal_checking",
  });
  const conflicting = await db
    .select({ id: rosterEntry.id })
    .from(rosterEntry)
    .where(
      and(eq(rosterEntry.email, value.email), eq(rosterEntry.active, true)),
    )
    .limit(1);
  if (conflicting[0])
    throw new RosterApplyError(
      "That email already has an active roster entry.",
      409,
    );

  const replaced = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${establishment.id} from ${establishment} where ${establishment.id} = ${establishmentId} for update`,
    );
    const clubs = await tx
      .select({
        rosterVersion: establishment.rosterVersion,
        organizationId: establishment.organizationId,
      })
      .from(establishment)
      .where(eq(establishment.id, establishmentId))
      .limit(1);
    if (!clubs[0]) throw new RosterApplyError("Eating club not found.", 404);
    const oldRows = await tx
      .select({
        email: rosterEntry.email,
        linkedUserId: rosterEntry.linkedUserId,
      })
      .from(rosterEntry)
      .where(
        and(
          eq(rosterEntry.establishmentId, establishmentId),
          eq(rosterEntry.accountType, "shared_meal_checking"),
          eq(rosterEntry.active, true),
        ),
      );
    await tx
      .update(rosterEntry)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(rosterEntry.establishmentId, establishmentId),
          eq(rosterEntry.accountType, "shared_meal_checking"),
          eq(rosterEntry.active, true),
        ),
      );
    for (const old of oldRows) {
      if (!old.linkedUserId) continue;
      if (clubs[0].organizationId) {
        await tx
          .delete(member)
          .where(
            and(
              eq(member.organizationId, clubs[0].organizationId),
              eq(member.userId, old.linkedUserId),
            ),
          );
      }
      await tx.delete(session).where(eq(session.userId, old.linkedUserId));
      await tx
        .update(user)
        .set({
          role: "user",
          homeEstablishmentId: null,
          isExchangeEligible: false,
          eligibilityUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(user.id, old.linkedUserId));
    }
    const inserted = await tx
      .insert(rosterEntry)
      .values({
        email: value.email,
        fullName: value.fullName,
        source: "club",
        establishmentId,
        role: "admin",
        accountType: "shared_meal_checking",
        exchangeEligible: false,
      })
      .returning({ id: rosterEntry.id });
    const replacementUsers = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, value.email))
      .limit(1);
    if (replacementUsers[0]) {
      await tx
        .update(rosterEntry)
        .set({ linkedUserId: replacementUsers[0].id })
        .where(eq(rosterEntry.id, inserted[0].id));
      await tx
        .update(user)
        .set({
          name: value.fullName,
          accountType: "shared_meal_checking",
          homeEstablishmentId: establishmentId,
          isExchangeEligible: false,
          eligibilityUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(user.id, replacementUsers[0].id));
      if (clubs[0].organizationId) {
        await tx
          .insert(member)
          .values({
            id: randomUUID(),
            organizationId: clubs[0].organizationId,
            userId: replacementUsers[0].id,
            role: "admin",
          })
          .onConflictDoUpdate({
            target: [member.organizationId, member.userId],
            set: { role: "admin" },
          });
      }
    }
    await tx
      .update(establishment)
      .set({ rosterVersion: clubs[0].rosterVersion + 1 })
      .where(eq(establishment.id, establishmentId));
    return {
      oldEmails: oldRows.map((row) => row.email),
      id: inserted[0]?.id,
      rosterVersion: clubs[0].rosterVersion + 1,
    };
  });
  await synchronizeUsersByEmail([...replaced.oldEmails, value.email]);
  await notifyRemovedUsers(
    replaced.oldEmails,
    establishmentId,
    replaced.rosterVersion,
  );
  return { id: replaced.id };
}

export async function retryAccessNotification(notificationId: string) {
  const records = await db
    .select()
    .from(accessNotification)
    .where(eq(accessNotification.id, notificationId))
    .limit(1);
  const record = records[0];
  if (!record || record.status !== "failed") {
    throw new RosterApplyError("Failed notification not found.", 404);
  }
  await db
    .update(accessNotification)
    .set({ status: "sending", errorMessage: null })
    .where(eq(accessNotification.id, record.id));
  try {
    const result = await sendEmail({
      to: record.email,
      subject: "Your Princeton Meal Exchange access changed",
      text: [
        "Your email is no longer included in an active Princeton Meal Exchange roster.",
        "Your active sessions have been signed out, and you cannot sign in again unless an administrator restores access.",
        "If you believe this is a mistake, contact your eating club or the Meal Exchange platform team.",
      ].join("\n\n"),
      idempotencyKey: record.idempotencyKey,
    });
    await db
      .update(accessNotification)
      .set({
        status: "sent",
        providerId: result?.id ?? null,
        sentAt: new Date(),
      })
      .where(eq(accessNotification.id, record.id));
  } catch (error) {
    await db
      .update(accessNotification)
      .set({
        status: "failed",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Unknown email error",
      })
      .where(eq(accessNotification.id, record.id));
    throw error;
  }
}

export class RosterApplyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const ROSTER_CSV_TEMPLATE = [
  "email,full_name,role,exchange_eligible,student_id,class_year,account_type",
  "club-owner@example.com,Club Owner,owner,false,,,person",
  "shared-checking@example.com,Shared Meal Checking,admin,false,,,shared_meal_checking",
].join("\n");
