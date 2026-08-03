/*
 * Princeton Meal Exchange — database schema reference
 *
 * Human-readable PostgreSQL-like DDL for the current Drizzle schema. Apply the
 * versioned files in drizzle/ rather than executing this reference directly.
 */

CREATE TYPE meal_type AS ENUM ('lunch', 'dinner');
CREATE TYPE exchange_status AS ENUM ('pending', 'accepted', 'completed');
CREATE TYPE email_delivery_status AS ENUM
  ('pending', 'sending', 'sent', 'failed');
CREATE TYPE establishment_type AS ENUM ('dining_hall', 'eating_club');

-- Canonical dining halls and eating clubs. Migration 0005 seeds the currently
-- supported locations; inactive rows remain available for historical records.
CREATE TABLE establishment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type establishment_type NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX establishment_name_unique ON establishment (name);

-- Better Auth owns the identity fields. Flow 4 owns roster and eligibility
-- fields; application flows consume the persisted values and fail closed.
CREATE TABLE "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  student_id text,
  graph_id text,
  plan_code text,
  is_exchange_eligible boolean NOT NULL DEFAULT false,
  class_year integer,
  home_establishment_id uuid REFERENCES establishment (id) ON DELETE SET NULL,
  eligibility_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_email_unique ON "user" (email);
CREATE UNIQUE INDEX user_student_id_unique ON "user" (student_id);
CREATE UNIQUE INDEX user_graph_id_unique ON "user" (graph_id);

-- Better Auth session, provider-account, and verification tables.
CREATE TABLE session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX session_token_unique ON session (token);

CREATE TABLE account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Flow 3 checking session. Flow 5 will add establishment ownership and replace
-- the temporary any-authenticated-user authorization boundary.
CREATE TABLE meal_check_session (
  id uuid PRIMARY KEY,
  checker_user_id text NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX meal_check_session_checker_user_id_idx
  ON meal_check_session (checker_user_id);
CREATE UNIQUE INDEX meal_check_session_one_active_per_checker_unique
  ON meal_check_session (checker_user_id) WHERE ended_at IS NULL;

-- The initiator owns the invitation while meal_host_user_id and
-- meal_guest_user_id capture the reciprocal meal roles derived from roster
-- affiliation and location. Names/email/location are event-time snapshots.
CREATE TABLE exchange (
  id uuid PRIMARY KEY,
  host_user_id text NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  counterpart_user_id text REFERENCES "user" (id) ON DELETE SET NULL,
  meal_host_user_id text NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  meal_guest_user_id text NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  pair_key text NOT NULL,
  host_name text NOT NULL,
  counterpart_name text NOT NULL,
  counterpart_email text NOT NULL,
  location text NOT NULL,
  establishment_id uuid NOT NULL
    REFERENCES establishment (id) ON DELETE RESTRICT,
  meal_type meal_type NOT NULL,
  exchange_date date NOT NULL,
  expires_at timestamptz NOT NULL,
  status exchange_status NOT NULL DEFAULT 'pending',
  accepted_at timestamptz,
  completed_at timestamptz,
  meal_check_session_id uuid
    REFERENCES meal_check_session (id) ON DELETE SET NULL,
  invitation_token_hash text NOT NULL,
  barcode_value text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  invitation_email_status email_delivery_status NOT NULL DEFAULT 'pending',
  invitation_email_id text,
  confirmation_email_status email_delivery_status NOT NULL DEFAULT 'pending',
  confirmation_email_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX exchange_invitation_token_hash_unique
  ON exchange (invitation_token_hash);
CREATE UNIQUE INDEX exchange_barcode_value_unique
  ON exchange (barcode_value);
CREATE UNIQUE INDEX exchange_host_idempotency_key_unique
  ON exchange (host_user_id, idempotency_key);
CREATE INDEX exchange_counterpart_user_id_idx
  ON exchange (counterpart_user_id);
CREATE INDEX exchange_counterpart_email_idx
  ON exchange (counterpart_email);
CREATE INDEX exchange_meal_check_session_id_idx
  ON exchange (meal_check_session_id);
CREATE INDEX exchange_date_establishment_idx
  ON exchange (exchange_date, establishment_id);
CREATE UNIQUE INDEX exchange_pair_meal_unique
  ON exchange (pair_key, exchange_date, meal_type, establishment_id);

/*
 * Key invariants
 * --------------
 * - is_exchange_eligible defaults false; no roster row or false means denied.
 * - pair_key is the two participant IDs sorted and joined by a colon.
 * - expires_at is an invitation-acceptance deadline, not the meal date.
 * - exchange_date drives pass-date validation in America/New_York.
 * - one shared barcode_value is generated per exchange.
 * - counterpart_user_id is bound when the invited account accepts.
 * - completion atomically sets status, completed_at, and meal_check_session_id.
 */
