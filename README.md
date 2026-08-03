# Princeton Meal Exchange

A mobile-responsive Next.js application for Princeton's reciprocal meal
exchange program. The current implementation covers persisted exchange
creation and acceptance, a shared barcode, and meal-checking sessions. Better
Auth provides passwordless email and production TigerNet OIDC authentication.

The complete database structure is documented in
[`docs/database-schema.sql`](docs/database-schema.sql).

## Authentication

- Passwordless email links are delivered through Resend.
- TigerNet OIDC is registered only in production and requests `openid`,
  `profile`, and `email`.
- TigerNet is intentionally unavailable in local development; the sign-in
  dialog displays an accessible explanation instead.
- For local Flow 1–3 development without configured auth, set
  `DEV_BYPASS_AUTH="true"` in `.env.local`. The bypass creates a clearly marked
  local identity and roster fixtures. It can only run under `next dev`; tests
  and production always use Better Auth.

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
admin authorization and wrong-location rejection remain Flow 5 work; a session
does not yet select or infer a venue.

Roster ingestion and eligibility freshness are owned by Flow 4. These flows use
the persisted boolean and intentionally do not call Microsoft Graph or impose a
separate freshness threshold.

Camera access requires HTTPS after deployment and works on `localhost` during
development.

## Getting started

```bash
npm install
copy .env.example .env.local
npm run start-dependencies
npm run dev
```

Open `http://localhost:3000`. `npm run start-dependencies` uses the
cross-platform Node script to start Postgres and the local Neon-compatible proxy,
wait for both services, and apply all Drizzle migrations.

Migration `0005_lonely_justice.sql` adds required fields to existing exchange
rows, so it assumes a disposable empty development exchange table. To rebuild
only this project's local Docker database when upgrading from the old schema:

```bash
docker compose down --volumes
npm run start-dependencies
```

The first command permanently removes this Compose project's local database
volume.

## Environment

- `DATABASE_URL`: local Postgres URL in `.env.local`; production Neon URL in
  Vercel
- `BETTER_AUTH_SECRET`: a long random signing secret
- `BETTER_AUTH_URL`: the application origin
- `TIGERNET_CLIENT_ID`, `TIGERNET_CLIENT_SECRET`, `TIGERNET_ISSUER_URL`:
  production TigerNet OIDC configuration
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: transactional email configuration
- `DEV_BYPASS_AUTH`: optional local-only Flow 1–3 preview identity

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
npm run email:dev
```

Drizzle migrations are generated from `src/db/schema.ts` into `drizzle/`.
