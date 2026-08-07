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
CREATE TYPE organization_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE roster_account_type AS ENUM ('person', 'shared_meal_checking');
CREATE TYPE roster_ingest_outcome AS ENUM ('applied', 'rejected');

-- Better Auth Organization plugin tables. Invitations exist because they are
-- part of the plugin schema, but application permissions reject their use.
CREATE TABLE organization (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  logo text,
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX organization_slug_unique ON organization (slug);

-- Canonical dining halls and eating clubs. Migration 0005 seeds the currently
-- supported locations; inactive rows remain available for historical records.
CREATE TABLE establishment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type establishment_type NOT NULL,
  organization_id text REFERENCES organization (id) ON DELETE SET NULL,
  roster_version integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX establishment_name_unique ON establishment (name);
CREATE UNIQUE INDEX establishment_organization_id_unique
  ON establishment (organization_id);

-- Better Auth owns the identity fields. Flow 4 owns roster and eligibility
-- fields; application flows consume the persisted values and fail closed.
CREATE TABLE "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  role text NOT NULL DEFAULT 'user',
  banned boolean NOT NULL DEFAULT false,
  ban_reason text,
  ban_expires timestamptz,
  account_type roster_account_type NOT NULL DEFAULT 'person',
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
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  impersonated_by text,
  active_organization_id text
    REFERENCES organization (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX session_token_unique ON session (token);
CREATE INDEX session_user_id_idx ON session (user_id);

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

CREATE INDEX account_user_id_idx ON account (user_id);

CREATE TABLE verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX verification_identifier_idx ON verification (identifier);

CREATE TABLE member (
  id text PRIMARY KEY,
  organization_id text NOT NULL
    REFERENCES organization (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX member_organization_user_unique
  ON member (organization_id, user_id);

CREATE TABLE invitation (
  id text PRIMARY KEY,
  organization_id text NOT NULL
    REFERENCES organization (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  inviter_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Active roster entries are the account-creation and organization-membership
-- authority. Historical inactive rows remain available for audit.
CREATE TABLE roster_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  source text NOT NULL DEFAULT 'club',
  establishment_id uuid REFERENCES establishment (id) ON DELETE CASCADE,
  role organization_role NOT NULL DEFAULT 'member',
  account_type roster_account_type NOT NULL DEFAULT 'person',
  exchange_eligible boolean NOT NULL DEFAULT false,
  student_id text,
  class_year integer,
  active boolean NOT NULL DEFAULT true,
  linked_user_id text REFERENCES "user" (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX roster_entry_one_active_club_per_email_unique
  ON roster_entry (email)
  WHERE active = true AND establishment_id IS NOT NULL;
CREATE UNIQUE INDEX roster_entry_one_active_shared_account_per_club_unique
  ON roster_entry (establishment_id)
  WHERE active = true AND account_type = 'shared_meal_checking';

CREATE TABLE roster_ingest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_user_id text NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL
    REFERENCES establishment (id) ON DELETE RESTRICT,
  filename text NOT NULL,
  checksum text NOT NULL,
  base_roster_version integer NOT NULL,
  added_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  outcome roster_ingest_outcome NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE TABLE admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id text REFERENCES "user" (id) ON DELETE SET NULL,
  session_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  organization_id text REFERENCES organization (id) ON DELETE SET NULL,
  establishment_id uuid REFERENCES establishment (id) ON DELETE SET NULL,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE access_notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES "user" (id) ON DELETE SET NULL,
  email text NOT NULL,
  kind text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status email_delivery_status NOT NULL DEFAULT 'pending',
  provider_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- Flow 3 checking session. Flow 5 deliberately leaves its existing
-- authentication and venue-authorization boundary unchanged.
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
 * - account creation requires an active roster entry or platform allowlist.
 * - active roster emails are normalized to lowercase by application services.
 * - a shared_meal_checking account is an exchange-ineligible organization admin.
 * - at most one active shared meal-checking account exists per eating club.
 * - PLATFORM_ADMIN_EMAILS plus stored role='admin' grants global administration.
 * - CSV replacement locks and increments establishment.roster_version.
 * - pair_key is the two participant IDs sorted and joined by a colon.
 * - expires_at is an invitation-acceptance deadline, not the meal date.
 * - exchange_date drives pass-date validation in America/New_York.
 * - one shared barcode_value is generated per exchange.
 * - counterpart_user_id is bound when the invited account accepts.
 * - completion atomically sets status, completed_at, and meal_check_session_id.
 */
