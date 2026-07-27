# Princeton Meal Exchange

A Next.js TypeScript app configured for Tailwind CSS, Better Auth with Google OAuth, Drizzle ORM, Neon Postgres, and Resend.

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
npm run dev
```

Open `http://localhost:3000`.

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
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuth web credentials
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL`: Resend transactional email settings

For Google OAuth, add these redirect URIs in Google Cloud:

- Local: `http://localhost:3000/api/auth/callback/google`
- Production: `https://your-domain.com/api/auth/callback/google`

## Useful Scripts

```bash
npm run lint
npm run format
npm run db:generate
npm run db:migrate
```

Drizzle migrations are generated from `src/db/schema.ts` into `drizzle/`.
