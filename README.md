# Princeton Meal Exchange

A mobile-responsive Next.js application for Princeton's reciprocal meal
exchange program. The current implementation covers persisted exchange
creation and acceptance, a shared barcode, meal-checking sessions, and
roster-driven eating-club administration. Better Auth provides passwordless
email, production TigerNet OIDC authentication, platform administration, and
organization membership.

The complete database structure is documented in
[`docs/database-schema.sql`](docs/database-schema.sql).

## Authentication

- Passwordless email links are delivered through Resend.
- New accounts are created only for active roster emails or emails listed in
  `PLATFORM_ADMIN_EMAILS`. Magic-link requests always return a generic response,
  including for denied addresses.
- TigerNet OIDC is registered only in production and requests `openid`,
  `profile`, and `email`.
- TigerNet is intentionally unavailable in local development; the sign-in
  dialog displays an accessible explanation instead.
- For local development without configured auth, set `DEV_BYPASS_AUTH="true"`
  in `.env.local`. The bypass creates a clearly marked local identity. It can
  only run under `next dev`; tests and production always use Better Auth.
- Flow 5 has two additional, explicit local role switches:
  `DEV_BYPASS_ORGANIZATION_ADMIN="true"` and
  `DEV_BYPASS_PLATFORM_ADMIN="true"`. Both depend on the base auth bypass and
  are ignored outside `next dev`.

Register this callback URL with TigerNet:

```text
https://your-production-domain/api/auth/oauth2/callback/tigernet
```

## Flow 1: Create an exchange

The signed-in home page searches the local eligibility roster with
`GET /api/students/search?q=...`. Search is deliberately database-only; Graph
API autocomplete is not part of this integration.

Create an invitation with `POST /api/exchanges`, a unique `Idempotency-Key`
header, and this body:

```json
{
  "counterpartId": "better-auth-user-id",
  "establishmentId": "establishment-uuid",
  "mealType": "dinner",
  "date": "2030-05-12"
}
```

Creation fails closed unless both students exist in the roster and have
`is_exchange_eligible = true`. It also enforces a ten-open-exchange limit and
prevents the same pair from creating the same meal at the same location and
date twice.

The meal host and guest are derived from roster affiliation:

- At an eating club, exactly one participant must belong to that club; that
  participant is the meal host.
- At a dining hall, exactly one participant must have no eating-club home; that
  participant is the meal host.

The initiator remains the invitation owner independently of the derived meal
roles. Names, email, and location are retained as event-time snapshots.

## Flow 2: Accept an exchange

Invitation URLs contain an opaque token whose SHA-256 hash is stored in the
database. An authenticated counterpart first claims the invitation by matching
the invited email; subsequent authorization uses the stored user ID. Acceptance
generates one shared Code 128 barcode and sends the same confirmation details to
both participants.

The acceptance deadline is the earlier of seven days after creation or the end
of the selected meal date. Once accepted, the pass remains valid through that
meal date even if the invitation deadline has passed.

## Flow 3: Meal checking

Authenticated users can open `/meal-checking`, start or resume one active
session, scan a shared barcode with the device camera, or enter its printed
`ME-XXXX-XXXX-XXXX` code.

Check-in validates all currently available Flow 3 rules:

- the session belongs to the checker and is active;
- the exchange exists and has status `accepted`;
- the selected meal date is today in `America/New_York`;
- both stored meal participants still have `is_exchange_eligible = true`; and
- the exchange has not already been completed.

Completion is atomic and records the checker session and timestamp. The UI
shows the derived guest, meal type, and stored location. Establishment-bound
meal-checker authorization and wrong-location rejection remain a future Flow 3
integration; Flow 5 deliberately does not change the existing meal-checking
routes or behavior.

Roster ingestion and eligibility freshness are owned by Flow 4. These flows use
the persisted boolean and intentionally do not call Microsoft Graph or impose a
separate freshness threshold.

Camera access requires HTTPS after deployment and works on `localhost` during
development.

## Flow 5: Roster-driven administration

Better Auth's Admin and Organization plugins back the platform and club access
models. Organization creation, deletion, invitations, and direct member
mutation are not exposed through their stock APIs; the active roster is the
only membership authority.

- Platform administrators must appear in the case-insensitive
  `PLATFORM_ADMIN_EMAILS` environment variable and have the persisted Better
  Auth `admin` role.
- Organization roles are `owner`, `admin`, and `member`. Owners and admins can
  manage their club roster; only owners and platform administrators can
  transfer ownership.
- The first allowlisted club owner to sign in creates the Better Auth
  organization and provisions already-registered roster users.
- An admin who signs in before the first owner sees `/organization-pending`.
- Each club may have one `shared_meal_checking` account. It is always an
  exchange-ineligible organization admin and may hold concurrent sessions on
  multiple devices. Audit records identify the shared account and session, not
  the individual operator.
- Removing a person's final active roster source revokes all sessions, keeps
  the user row, marks exchange eligibility false, and queues an idempotent
  Resend notification.

The club dashboard is at `/admin`; the website-team console is at
`/platform-admin`. CSV uploads are UTF-8 files up to 2 MB. Required columns are
`email`, `full_name`, `role`, and `exchange_eligible`; optional columns are
`student_id`, `class_year`, and `account_type`. Every upload must be previewed,
and application rechecks the file checksum and roster version inside a
transaction.

Flow 4's Princeton student/class-year feed remains deferred. Until it is
implemented, ordinary students who are not represented by another active
roster source cannot create accounts.

## Getting started

```bash
npm install
copy .env.example .env.local
npm run start-dependencies
npm run db:seed:flow5
npm run dev
```

Open `http://localhost:3000`. `npm run start-dependencies` uses the
cross-platform Node script to start Postgres and the local Neon-compatible proxy,
wait for both services, and apply all Drizzle migrations.

`db:seed:flow5` is an idempotent, local-database-only seed. It creates three
sample Better Auth organizations, registered users, linked organization
memberships, club and Princeton roster entries, shared meal-checking accounts,
and a few upcoming/completed exchanges. It updates only its deterministic
development fixtures and refuses non-local database hosts. With all three
development bypass variables enabled, open `/platform-admin`; use each club's
"Manage club" link to preview its `/admin` dashboard. With only the
organization-admin role enabled, the local developer previews Cottage Club
directly at `/admin`.

Migration `0005_lonely_justice.sql` adds required fields to existing exchange
rows, so it assumes a disposable empty development exchange table. To rebuild
only this project's local Docker database when upgrading from the old schema:

```bash
docker compose down --volumes
npm run start-dependencies
```

The first command permanently removes this Compose project's local database
volume.

Migrations `0006_lowly_fixer.sql` and `0007_striped_toxin.sql` add the Better
Auth Admin/Organization schema, roster authority, audit and notification
tables, plus supporting identity indexes.

## Environment

- `DATABASE_URL`: local Postgres URL in `.env.local`; production Neon URL in
  Vercel
- `BETTER_AUTH_SECRET`: a long random signing secret
- `BETTER_AUTH_URL`: the application origin
- `TIGERNET_CLIENT_ID`, `TIGERNET_CLIENT_SECRET`, `TIGERNET_ISSUER_URL`:
  production TigerNet OIDC configuration
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: transactional email configuration
- `PLATFORM_ADMIN_EMAILS`: comma-separated, server-only website-team allowlist
- `DEV_BYPASS_AUTH`: optional local-only preview identity
- `DEV_BYPASS_ORGANIZATION_ADMIN`: optional local-only organization-admin role
  for the preview identity; requires `DEV_BYPASS_AUTH=true`
- `DEV_BYPASS_PLATFORM_ADMIN`: optional local-only platform-admin role for the
  preview identity; requires `DEV_BYPASS_AUTH=true`

Magic-link sign-in requires Resend credentials. Without them, non-production
exchange emails are skipped with an explicit server-console warning so the
persisted local flows remain testable.

## Useful scripts

```bash
npm run start-dependencies
npm run dev
npm test
npm run lint
npm run format:check
npm run db:generate
npm run db:migrate
npm run db:seed:flow5
npm run auth:generate
npm run email:dev
```

Drizzle migrations are generated from `src/db/schema.ts` into `drizzle/`.
The pinned `auth:generate` command uses `auth@1.6.11`, matching the installed
Better Auth runtime. Use it to verify plugin schema changes before incorporating
them into the application-owned Drizzle schema.
