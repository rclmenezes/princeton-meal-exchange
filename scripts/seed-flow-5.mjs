import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: `${repositoryRoot}/.env.local`, quiet: true });
dotenv.config({ path: `${repositoryRoot}/.env`, quiet: true });

const { Pool } = pg;
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/main";
const databaseUrl = new URL(connectionString);
const allowedHosts = new Set([
  "127.0.0.1",
  "[::1]",
  "::1",
  "db.localtest.me",
  "localhost",
]);

const clubs = [
  {
    name: "Cottage Club",
    slug: "cottage-club",
    organizationId: "development-organization-cottage-club",
  },
  {
    name: "Colonial Club",
    slug: "colonial-club",
    organizationId: "development-organization-colonial-club",
  },
  {
    name: "Tiger Inn",
    slug: "tiger-inn",
    organizationId: "development-organization-tiger-inn",
  },
];

const people = [
  {
    id: "development-auth-bypass-user",
    name: "Local Developer",
    email: "development-auth-bypass@localhost.invalid",
    role: "admin",
    club: "Cottage Club",
    organizationRole: "admin",
    exchangeEligible: true,
    planCode: "unlimited",
    studentId: null,
    classYear: null,
    accountType: "person",
  },
  {
    id: "development-cottage-owner",
    name: "Alex Chen",
    email: "alex.cottage@localhost.invalid",
    role: "user",
    club: "Cottage Club",
    organizationRole: "owner",
    exchangeEligible: true,
    planCode: "eating-club",
    studentId: "development-1001",
    classYear: 2027,
    accountType: "person",
  },
  {
    id: "development-cottage-member",
    name: "Maya Hernandez",
    email: "maya.development@localhost.invalid",
    role: "user",
    club: "Cottage Club",
    organizationRole: "member",
    exchangeEligible: true,
    planCode: "eating-club",
    studentId: "development-1002",
    classYear: 2028,
    accountType: "person",
  },
  {
    id: "development-cottage-member-jordan",
    name: "Jordan Brooks",
    email: "jordan.cottage@localhost.invalid",
    role: "user",
    club: "Cottage Club",
    organizationRole: "member",
    exchangeEligible: true,
    planCode: "eating-club",
    studentId: "development-1003",
    classYear: 2027,
    accountType: "person",
  },
  {
    id: "development-cottage-shared-checker",
    name: "Cottage Meal Checking",
    email: "cottage-meal-checking@localhost.invalid",
    role: "user",
    club: "Cottage Club",
    organizationRole: "admin",
    exchangeEligible: false,
    planCode: null,
    studentId: null,
    classYear: null,
    accountType: "shared_meal_checking",
  },
  {
    id: "development-colonial-owner",
    name: "Priya Shah",
    email: "priya.colonial@localhost.invalid",
    role: "user",
    club: "Colonial Club",
    organizationRole: "owner",
    exchangeEligible: true,
    planCode: "eating-club",
    studentId: "development-2001",
    classYear: 2027,
    accountType: "person",
  },
  {
    id: "development-colonial-member",
    name: "Devon Williams",
    email: "devon.colonial@localhost.invalid",
    role: "user",
    club: "Colonial Club",
    organizationRole: "member",
    exchangeEligible: true,
    planCode: "eating-club",
    studentId: "development-2002",
    classYear: 2028,
    accountType: "person",
  },
  {
    id: "development-colonial-shared-checker",
    name: "Colonial Meal Checking",
    email: "colonial-meal-checking@localhost.invalid",
    role: "user",
    club: "Colonial Club",
    organizationRole: "admin",
    exchangeEligible: false,
    planCode: null,
    studentId: null,
    classYear: null,
    accountType: "shared_meal_checking",
  },
  {
    id: "development-tiger-owner",
    name: "Sam Okafor",
    email: "sam.tiger-inn@localhost.invalid",
    role: "user",
    club: "Tiger Inn",
    organizationRole: "owner",
    exchangeEligible: true,
    planCode: "eating-club",
    studentId: "development-3001",
    classYear: 2027,
    accountType: "person",
  },
  {
    id: "development-tiger-member",
    name: "Riley Kim",
    email: "riley.tiger-inn@localhost.invalid",
    role: "user",
    club: "Tiger Inn",
    organizationRole: "member",
    exchangeEligible: true,
    planCode: "eating-club",
    studentId: "development-3002",
    classYear: 2028,
    accountType: "person",
  },
  {
    id: "development-tiger-shared-checker",
    name: "Tiger Inn Meal Checking",
    email: "tiger-inn-meal-checking@localhost.invalid",
    role: "user",
    club: "Tiger Inn",
    organizationRole: "admin",
    exchangeEligible: false,
    planCode: null,
    studentId: null,
    classYear: null,
    accountType: "shared_meal_checking",
  },
  {
    id: "development-ineligible-student",
    name: "Taylor Morgan",
    email: "taylor.development@localhost.invalid",
    role: "user",
    club: null,
    organizationRole: "member",
    exchangeEligible: false,
    planCode: "block-32",
    studentId: "development-4001",
    classYear: 2028,
    accountType: "person",
  },
  {
    id: "development-university-student-casey",
    name: "Casey Nguyen",
    email: "casey.development@localhost.invalid",
    role: "user",
    club: null,
    organizationRole: "member",
    exchangeEligible: true,
    planCode: "block-128",
    studentId: "development-4002",
    classYear: 2029,
    accountType: "person",
  },
  {
    id: "development-university-student-avery",
    name: "Avery Robinson",
    email: "avery.development@localhost.invalid",
    role: "user",
    club: null,
    organizationRole: "member",
    exchangeEligible: true,
    planCode: "unlimited",
    studentId: "development-4003",
    classYear: 2029,
    accountType: "person",
  },
];

function localDate(offsetDays) {
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const base = new Date(
    Date.UTC(
      Number(dateParts.year),
      Number(dateParts.month) - 1,
      Number(dateParts.day) + offsetDays,
    ),
  );
  return base.toISOString().slice(0, 10);
}

async function upsertOrganization(client, club) {
  const establishmentResult = await client.query(
    `select id, organization_id from establishment where name = $1 and type = 'eating_club' limit 1`,
    [club.name],
  );
  const establishment = establishmentResult.rows[0];
  if (!establishment) {
    throw new Error(
      `${club.name} is missing. Run npm run db:migrate before seeding.`,
    );
  }

  let organizationId = establishment.organization_id;
  if (!organizationId) {
    const existingOrganization = await client.query(
      `select id from organization where slug = $1 limit 1`,
      [club.slug],
    );
    organizationId = existingOrganization.rows[0]?.id ?? club.organizationId;
  }

  await client.query(
    `insert into organization (id, name, slug, metadata)
     values ($1, $2, $3, $4)
     on conflict (id) do update set
       name = excluded.name,
       slug = excluded.slug,
       metadata = excluded.metadata`,
    [
      organizationId,
      club.name,
      club.slug,
      JSON.stringify({
        establishmentId: establishment.id,
        developmentFixture: true,
      }),
    ],
  );
  await client.query(
    `update establishment
     set organization_id = $1, roster_version = greatest(roster_version, 1)
     where id = $2`,
    [organizationId, establishment.id],
  );

  return { ...club, id: establishment.id, organizationId };
}

async function upsertUser(client, person, establishments) {
  const homeEstablishmentId = person.club
    ? establishments.get(person.club).id
    : null;
  await client.query(
    `insert into "user" (
       id, name, email, email_verified, role, banned, account_type,
       student_id, plan_code, is_exchange_eligible, class_year,
       home_establishment_id, eligibility_updated_at, updated_at
     ) values (
       $1, $2, $3, true, $4, false, $5, $6, $7, $8, $9, $10, now(), now()
     )
     on conflict (id) do update set
       name = excluded.name,
       email = excluded.email,
       email_verified = true,
       role = excluded.role,
       banned = false,
       ban_reason = null,
       ban_expires = null,
       account_type = excluded.account_type,
       student_id = excluded.student_id,
       plan_code = excluded.plan_code,
       is_exchange_eligible = excluded.is_exchange_eligible,
       class_year = excluded.class_year,
       home_establishment_id = excluded.home_establishment_id,
       eligibility_updated_at = excluded.eligibility_updated_at,
       updated_at = now()`,
    [
      person.id,
      person.name,
      person.email,
      person.role,
      person.accountType,
      person.studentId,
      person.planCode,
      person.exchangeEligible,
      person.classYear,
      homeEstablishmentId,
    ],
  );
}

async function upsertRosterEntry(client, person, index, establishments) {
  const establishment = person.club ? establishments.get(person.club) : null;
  const source = establishment
    ? `development-${establishment.slug}-roster`
    : "development-princeton-roster";
  const rosterId = `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;

  await client.query(
    `insert into roster_entry (
       id, email, full_name, source, establishment_id, role, account_type,
       exchange_eligible, student_id, class_year, active, linked_user_id,
       updated_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, now()
     )
     on conflict (id) do update set
       email = excluded.email,
       full_name = excluded.full_name,
       source = excluded.source,
       establishment_id = excluded.establishment_id,
       role = excluded.role,
       account_type = excluded.account_type,
       exchange_eligible = excluded.exchange_eligible,
       student_id = excluded.student_id,
       class_year = excluded.class_year,
       active = true,
       linked_user_id = excluded.linked_user_id,
       updated_at = now()`,
    [
      rosterId,
      person.email,
      person.name,
      source,
      establishment?.id ?? null,
      person.organizationRole,
      person.accountType,
      person.exchangeEligible,
      person.studentId,
      person.classYear,
      person.id,
    ],
  );
}

async function upsertMembership(client, person, index, establishments) {
  if (!person.club) return;
  const organizationId = establishments.get(person.club).organizationId;
  await client.query(
    `insert into member (id, organization_id, user_id, role)
     values ($1, $2, $3, $4)
     on conflict (organization_id, user_id) do update set role = excluded.role`,
    [
      `development-member-${String(index + 1).padStart(2, "0")}`,
      organizationId,
      person.id,
      person.organizationRole,
    ],
  );
}

async function upsertExchange(client, fixture) {
  await client.query(
    `insert into exchange (
       id, host_user_id, counterpart_user_id, meal_host_user_id,
       meal_guest_user_id, pair_key, host_name, counterpart_name,
       counterpart_email, location, establishment_id, meal_type,
       exchange_date, expires_at, status, accepted_at, completed_at,
       invitation_token_hash, barcode_value, idempotency_key,
       request_fingerprint, invitation_email_status,
       confirmation_email_status, updated_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18, $19, $20, $21, 'sent', 'sent', now()
     )
     on conflict (id) do update set
       host_user_id = excluded.host_user_id,
       counterpart_user_id = excluded.counterpart_user_id,
       meal_host_user_id = excluded.meal_host_user_id,
       meal_guest_user_id = excluded.meal_guest_user_id,
       pair_key = excluded.pair_key,
       host_name = excluded.host_name,
       counterpart_name = excluded.counterpart_name,
       counterpart_email = excluded.counterpart_email,
       location = excluded.location,
       establishment_id = excluded.establishment_id,
       meal_type = excluded.meal_type,
       exchange_date = excluded.exchange_date,
       expires_at = excluded.expires_at,
       status = excluded.status,
       accepted_at = excluded.accepted_at,
       completed_at = excluded.completed_at,
       updated_at = now()`,
    [
      fixture.id,
      fixture.initiatorId,
      fixture.guestId,
      fixture.hostId,
      fixture.guestId,
      fixture.pairKey,
      fixture.hostName,
      fixture.guestName,
      fixture.guestEmail,
      fixture.club.name,
      fixture.club.id,
      fixture.mealType,
      fixture.date,
      fixture.expiresAt,
      fixture.status,
      fixture.acceptedAt,
      fixture.completedAt,
      `development-token-${fixture.id}`,
      fixture.barcode,
      `development-idempotency-${fixture.id}`,
      `development-fingerprint-${fixture.id}`,
    ],
  );
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Flow 5 development fixtures cannot be seeded in production.",
    );
  }
  if (!allowedHosts.has(databaseUrl.hostname)) {
    throw new Error(
      `Refusing to seed a non-local database host (${databaseUrl.hostname}).`,
    );
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const establishments = new Map();
    for (const club of clubs) {
      const seededClub = await upsertOrganization(client, club);
      establishments.set(club.name, seededClub);
    }

    for (const person of people) {
      await upsertUser(client, person, establishments);
    }
    for (const [index, person] of people.entries()) {
      await upsertRosterEntry(client, person, index, establishments);
      await upsertMembership(client, person, index, establishments);
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const acceptedAt = new Date(
      now.getTime() - 36 * 60 * 60 * 1_000,
    ).toISOString();
    const completedAt = new Date(
      now.getTime() - 24 * 60 * 60 * 1_000,
    ).toISOString();
    const exchanges = [
      {
        id: "60000000-0000-4000-8000-000000000001",
        initiatorId: "development-university-student-casey",
        hostId: "development-cottage-member",
        guestId: "development-university-student-casey",
        hostName: "Maya Hernandez",
        guestName: "Casey Nguyen",
        guestEmail: "casey.development@localhost.invalid",
        club: establishments.get("Cottage Club"),
        mealType: "dinner",
        date: localDate(1),
        status: "accepted",
        acceptedAt,
        completedAt: null,
        expiresAt,
        pairKey: "development-cottage-maya-casey",
        barcode: "ME-DEV1-COTT-0001",
      },
      {
        id: "60000000-0000-4000-8000-000000000002",
        initiatorId: "development-cottage-member-jordan",
        hostId: "development-cottage-member-jordan",
        guestId: "development-university-student-avery",
        hostName: "Jordan Brooks",
        guestName: "Avery Robinson",
        guestEmail: "avery.development@localhost.invalid",
        club: establishments.get("Cottage Club"),
        mealType: "lunch",
        date: localDate(3),
        status: "pending",
        acceptedAt: null,
        completedAt: null,
        expiresAt,
        pairKey: "development-cottage-jordan-avery",
        barcode: "ME-DEV1-COTT-0002",
      },
      {
        id: "60000000-0000-4000-8000-000000000003",
        initiatorId: "development-cottage-member",
        hostId: "development-cottage-member",
        guestId: "development-ineligible-student",
        hostName: "Maya Hernandez",
        guestName: "Taylor Morgan",
        guestEmail: "taylor.development@localhost.invalid",
        club: establishments.get("Cottage Club"),
        mealType: "lunch",
        date: localDate(-1),
        status: "completed",
        acceptedAt,
        completedAt,
        expiresAt,
        pairKey: "development-cottage-maya-taylor",
        barcode: "ME-DEV1-COTT-0003",
      },
      {
        id: "60000000-0000-4000-8000-000000000004",
        initiatorId: "development-university-student-casey",
        hostId: "development-colonial-member",
        guestId: "development-university-student-casey",
        hostName: "Devon Williams",
        guestName: "Casey Nguyen",
        guestEmail: "casey.development@localhost.invalid",
        club: establishments.get("Colonial Club"),
        mealType: "dinner",
        date: localDate(2),
        status: "accepted",
        acceptedAt,
        completedAt: null,
        expiresAt,
        pairKey: "development-colonial-devon-casey",
        barcode: "ME-DEV1-COLO-0001",
      },
      {
        id: "60000000-0000-4000-8000-000000000005",
        initiatorId: "development-tiger-member",
        hostId: "development-tiger-member",
        guestId: "development-ineligible-student",
        hostName: "Riley Kim",
        guestName: "Taylor Morgan",
        guestEmail: "taylor.development@localhost.invalid",
        club: establishments.get("Tiger Inn"),
        mealType: "dinner",
        date: localDate(-1),
        status: "completed",
        acceptedAt,
        completedAt,
        expiresAt,
        pairKey: "development-tiger-riley-taylor",
        barcode: "ME-DEV1-TIGR-0001",
      },
    ];
    for (const fixture of exchanges) {
      await upsertExchange(client, fixture);
    }

    await client.query("commit");
    console.log(
      `Seeded ${clubs.length} organizations, ${people.length} users and roster entries, and ${exchanges.length} dashboard exchanges.`,
    );
    console.log("Development admin: development-auth-bypass@localhost.invalid");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Unable to seed Flow 5 development fixtures: ${detail}`);
  process.exitCode = 1;
});
