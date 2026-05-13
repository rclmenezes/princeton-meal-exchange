# Princeton Meal Exchange

A Next.js TypeScript app configured for Tailwind CSS, Better Auth with Google OAuth, Drizzle ORM, Neon Postgres, and Resend.

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

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
