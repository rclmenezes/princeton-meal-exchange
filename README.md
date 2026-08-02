# Princeton Meal Exchange

A Next.js TypeScript app configured for Tailwind CSS, Better Auth with email
magic links and Princeton TigerNet OIDC, Drizzle ORM, Neon Postgres, and Resend.

The complete database structure and a description of every column are in
[`docs/database-schema.sql`](docs/database-schema.sql).

## Exchange API

Create an invitation with `POST /api/exchanges`. The client supplies a unique
`Idempotency-Key` header and a JSON body. The request must include a valid
Better Auth session; the host ID and display-name snapshot come from that
session rather than from client input.

```json
{
  "counterpartName": "Julian Park",
  "counterpartEmail": "julian@princeton.edu",
  "location": "Cottage Club",
  "mealType": "dinner",
  "expiresAt": "2030-05-12T23:00:00.000Z"
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
npm run start-dependencies
npm run dev
```

Open `http://localhost:3000`.

`npm run start-dependencies` starts Postgres and a local Neon-compatible proxy
with Docker Compose, waits for both services, and applies all Drizzle
migrations. Database data persists in a Docker volume between runs.

## Email previews

Preview the invitation and confirmation templates without sending email:

```bash
npm run email:dev
```

Open `http://localhost:3001` and select either exchange template. The preview
fixtures live in `emails/` and can be edited without touching database data.

## Environment

The example environment is configured for local development. Set production
values separately in Vercel:

- `DATABASE_URL`: local Postgres connection string in `.env.local`; use the
  production Neon connection string in Vercel
- `BETTER_AUTH_SECRET`: long random secret for Better Auth
- `BETTER_AUTH_URL`: app URL, for example `http://localhost:3000`
- `TIGERNET_CLIENT_ID` / `TIGERNET_CLIENT_SECRET`: production TigerNet OIDC
  client credentials
- `TIGERNET_ISSUER_URL`: TigerNet OIDC issuer URL
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL`: Resend transactional email settings

Register this production callback URL with TigerNet:

- `https://your-domain.com/api/auth/oauth2/callback/tigernet`

TigerNet sign-in is intentionally disabled during local development. Email
magic links work locally when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set.

## Useful Scripts

```bash
npm run start-dependencies
npm run lint
npm run format
npm run db:generate
npm run db:migrate
```

Drizzle migrations are generated from `src/db/schema.ts` into `drizzle/`.
