# Princeton Meal Exchange

A Next.js TypeScript app configured for Tailwind CSS, Better Auth with Google OAuth, Drizzle ORM, Neon Postgres, and Resend.

The complete database structure and a description of every column are in
[`docs/database-schema.sql`](docs/database-schema.sql).

## Flow 1: initiating an exchange

The home page implements the complete initiator flow:

1. Sign in through TigerNet OIDC.
2. Search Microsoft Graph by student name. Results are joined to the latest
   eligibility roster and ineligible or missing students cannot be selected.
3. Choose lunch or dinner, the meal date, and an active host location.
4. Submit. The server reloads and validates both participants and the location,
   derives the meal host/guest, enforces the 10-open-exchange cap, prevents
   duplicates, saves the invitation, and sends Alvin's Resend invitation.

In development, Graph search falls back to eligible users in the local database
when Graph credentials are absent.

## Exchange API

Create an invitation with `POST /api/exchanges`. The client supplies a unique
`Idempotency-Key` header and a JSON body. The request must include a valid
Better Auth session. Names, emails, eligibility, location, and host/guest roles
are resolved on the server rather than accepted from client input.

```json
{
  "counterpartId": "student-user-id",
  "establishmentId": "3ec6de13-73b7-4baa-8497-dce75c34f908",
  "mealType": "dinner",
  "date": "2030-05-12"
}
```

The endpoint persists the exchange, sends the invitation through Resend, and
returns its private `detailUrl`. Idempotency keys are unique per host, so two
hosts may independently use the same key. Acceptance initially requires the
current user's normalized email to match `counterpartEmail`, then stores that
user's ID. Once claimed, access is authorized by user ID even if the user's
email later changes.

The exchange keeps host/counterpart names and the invited email as snapshots so
historical messages and passes do not change when a user profile changes. The
host user is required; the counterpart user remains nullable until acceptance.

For a local preview without OAuth, set `DEV_BYPASS_AUTH="true"` in `.env.local`.
The exchange page will explicitly show that it is impersonating the invited
email. The bypass is ignored whenever `NODE_ENV` is `production`.

Migration `0003_curvy_green_goblin.sql` adds the required host foreign key. An
existing database with exchange rows needs a staged/manual version that first
adds and backfills `host_user_id` (or it must remove disposable development
rows) before enforcing `NOT NULL`. The old schema did not retain enough
information to infer the correct host safely.

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Zero-command local demo

Set `DEV_DEMO_MODE="true"` in `.env.local` to run Flow 1 without Docker,
Postgres, TigerNet, Graph, or Resend. Demo mode is always disabled when
`NODE_ENV=production`. It supplies a local signed-in student, searchable
eligibility fixtures, and host locations; submission runs the normal input and
host-location validation but does not persist data or send email.

`scripts/start-local.ps1` starts the development server in the background and
does nothing when port 3000 is already listening. It can be invoked from a
Windows Startup shortcut so the local demo is available immediately after
sign-in.

## Email previews

Preview the invitation and confirmation templates without sending email:

```bash
npm run email:dev
```

Open `http://localhost:3001` and select either exchange template. The preview
fixtures live in `emails/` and can be edited without touching database data.

## Environment

Set the values in `.env.local`, then mirror them in Vercel:

- `DATABASE_URL`: Neon Postgres connection string
- `BETTER_AUTH_SECRET`: long random secret for Better Auth
- `BETTER_AUTH_URL`: app URL, for example `http://localhost:3000`
- `TIGERNET_CLIENT_ID` / `TIGERNET_CLIENT_SECRET`: OIT-issued OIDC credentials
- `TIGERNET_DISCOVERY_URL`: TigerNet OIDC discovery document URL
- `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET`: server-only
  Microsoft Graph application credentials with directory-read permission
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: optional local OAuth credentials
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL`: Resend transactional email settings

Register these TigerNet callback URLs:

- Local: `http://localhost:3000/api/auth/oauth2/callback/tigernet`
- Production: `https://meal.exchange/api/auth/oauth2/callback/tigernet`

## Eligibility roster contract

The nightly roster process owns `student_id`, `graph_id`, `plan_code`,
`is_exchange_eligible`, `class_year`, `home_establishment_id`, and
`eligibility_updated_at` on `user`. Flow 1 does not infer eligibility from
Graph or hard-code plan names; both participants must have
`is_exchange_eligible = true` when the invitation is submitted.

## Useful Scripts

```bash
npm run lint
npm run format
npm run db:generate
npm run db:migrate
```

Drizzle migrations are generated from `src/db/schema.ts` into `drizzle/`.
