/*
 * Princeton Meal Exchange — database schema reference
 *
 * This file documents the complete application schema in PostgreSQL-like DDL.
 * It is a human-readable reference, not a migration. Apply migrations from the
 * drizzle/ directory instead.
 */

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

-- Which meal the exchange covers.
CREATE TYPE meal_type AS ENUM (
  'lunch',
  'dinner'
);

-- Current lifecycle state of an exchange.
CREATE TYPE exchange_status AS ENUM (
  'pending',  -- The invited counterpart has not accepted yet.
  'accepted'  -- The invited counterpart accepted the exchange.
);

-- Delivery state for each transactional email associated with an exchange.
CREATE TYPE email_delivery_status AS ENUM (
  'pending',  -- Delivery has not been attempted yet.
  'sending',  -- A worker/request is currently sending the email.
  'sent',     -- Resend accepted the email successfully.
  'failed'    -- The last delivery attempt failed and may be retried.
);

-- ---------------------------------------------------------------------------
-- BETTER AUTH TABLES
-- ---------------------------------------------------------------------------

-- One row per authenticated person.
CREATE TABLE "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN "user".id IS
  'Better Auth user identifier. Referenced by sessions and provider accounts.';
COMMENT ON COLUMN "user".name IS
  'Display name received from the authentication provider.';
COMMENT ON COLUMN "user".email IS
  'Primary login email. Also used to match a current user to an invitation.';
COMMENT ON COLUMN "user".email_verified IS
  'Whether the authentication provider or verification flow verified the email.';
COMMENT ON COLUMN "user".image IS
  'Optional profile-image URL supplied by the authentication provider.';
COMMENT ON COLUMN "user".created_at IS
  'Timestamp when the user row was created.';
COMMENT ON COLUMN "user".updated_at IS
  'Timestamp when the user row was last updated.';

CREATE UNIQUE INDEX user_email_unique ON "user" (email);


-- Active and historical login sessions.
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

COMMENT ON COLUMN session.id IS
  'Better Auth session identifier.';
COMMENT ON COLUMN session.expires_at IS
  'Time after which the session is no longer valid.';
COMMENT ON COLUMN session.token IS
  'Unique secret token used to resolve the current session.';
COMMENT ON COLUMN session.created_at IS
  'Timestamp when the session was created.';
COMMENT ON COLUMN session.updated_at IS
  'Timestamp when the session was last refreshed or changed.';
COMMENT ON COLUMN session.ip_address IS
  'Optional client IP address recorded by Better Auth.';
COMMENT ON COLUMN session.user_agent IS
  'Optional browser or client user-agent recorded by Better Auth.';
COMMENT ON COLUMN session.user_id IS
  'User who owns the session. Deleting the user deletes their sessions.';

CREATE UNIQUE INDEX session_token_unique ON session (token);


-- Authentication-provider credentials linked to a user.
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

COMMENT ON COLUMN account.id IS
  'Better Auth account-row identifier.';
COMMENT ON COLUMN account.account_id IS
  'Identifier assigned to this person by the authentication provider.';
COMMENT ON COLUMN account.provider_id IS
  'Authentication provider key, such as google.';
COMMENT ON COLUMN account.user_id IS
  'Local user linked to this provider account.';
COMMENT ON COLUMN account.access_token IS
  'Optional OAuth access token issued by the provider.';
COMMENT ON COLUMN account.refresh_token IS
  'Optional OAuth refresh token used to obtain new access tokens.';
COMMENT ON COLUMN account.id_token IS
  'Optional OpenID Connect identity token issued by the provider.';
COMMENT ON COLUMN account.access_token_expires_at IS
  'Expiration time of the OAuth access token.';
COMMENT ON COLUMN account.refresh_token_expires_at IS
  'Expiration time of the OAuth refresh token, when supplied.';
COMMENT ON COLUMN account.scope IS
  'Space-delimited OAuth permissions granted to the application.';
COMMENT ON COLUMN account.password IS
  'Optional password hash for credential-based providers; unused by Google SSO.';
COMMENT ON COLUMN account.created_at IS
  'Timestamp when the provider account was linked.';
COMMENT ON COLUMN account.updated_at IS
  'Timestamp when provider credentials were last updated.';


-- Short-lived verification and authentication challenges.
CREATE TABLE verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN verification.id IS
  'Better Auth verification-row identifier.';
COMMENT ON COLUMN verification.identifier IS
  'Email address or other subject being verified.';
COMMENT ON COLUMN verification.value IS
  'Secret verification value or token.';
COMMENT ON COLUMN verification.expires_at IS
  'Time after which the verification value cannot be used.';
COMMENT ON COLUMN verification.created_at IS
  'Timestamp when the verification challenge was created.';
COMMENT ON COLUMN verification.updated_at IS
  'Timestamp when the verification challenge was last updated.';

-- ---------------------------------------------------------------------------
-- MEAL EXCHANGE TABLES
-- ---------------------------------------------------------------------------

-- One invitation and eventual shared door pass between a host and counterpart.
CREATE TABLE exchange (
  id uuid PRIMARY KEY,
  host_user_id text NOT NULL REFERENCES "user" (id) ON DELETE RESTRICT,
  counterpart_user_id text REFERENCES "user" (id) ON DELETE SET NULL,
  host_name text NOT NULL,
  counterpart_name text NOT NULL,
  counterpart_email text NOT NULL,
  location text NOT NULL,
  meal_type meal_type NOT NULL,
  expires_at timestamptz NOT NULL,
  status exchange_status NOT NULL DEFAULT 'pending',
  accepted_at timestamptz,
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

COMMENT ON COLUMN exchange.id IS
  'Application-generated UUID identifying the exchange.';
COMMENT ON COLUMN exchange.host_user_id IS
  'Authenticated user who created and owns the exchange. User deletion is restricted while hosted exchanges remain.';
COMMENT ON COLUMN exchange.counterpart_user_id IS
  'Authenticated invited user who claimed the exchange. Null before acceptance and set to null if that account is deleted; accepted exchanges never fall back to email authorization.';
COMMENT ON COLUMN exchange.host_name IS
  'Display-name snapshot of the authenticated host when the exchange was created.';
COMMENT ON COLUMN exchange.counterpart_name IS
  'Display-name snapshot entered for the invited person.';
COMMENT ON COLUMN exchange.counterpart_email IS
  'Normalized lowercase invitation snapshot. Used to authorize the initial claim; authorization uses counterpart_user_id afterward.';
COMMENT ON COLUMN exchange.location IS
  'Dining hall, eating club, or other place where the meal occurs.';
COMMENT ON COLUMN exchange.meal_type IS
  'Meal category covered by the exchange: lunch or dinner.';
COMMENT ON COLUMN exchange.expires_at IS
  'Deadline for accepting or using the exchange. Expired exchanges cannot be accepted and their door code is hidden.';
COMMENT ON COLUMN exchange.status IS
  'Lifecycle state: pending before acceptance, accepted afterward.';
COMMENT ON COLUMN exchange.accepted_at IS
  'Timestamp when the counterpart accepted. Null while status is pending.';
COMMENT ON COLUMN exchange.invitation_token_hash IS
  'SHA-256 hash of the opaque token in the private invitation URL. The raw URL token is never stored.';
COMMENT ON COLUMN exchange.barcode_value IS
  'Stable human-readable door code generated once at creation, formatted ME-XXXX-XXXX-XXXX and encoded as Code 128.';
COMMENT ON COLUMN exchange.idempotency_key IS
  'Client-supplied key that, together with host_user_id, prevents duplicate exchanges when creation is retried.';
COMMENT ON COLUMN exchange.request_fingerprint IS
  'SHA-256 fingerprint of normalized creation input. Detects reuse of an idempotency key with different data.';
COMMENT ON COLUMN exchange.invitation_email_status IS
  'Current Resend delivery state for the initial invitation email.';
COMMENT ON COLUMN exchange.invitation_email_id IS
  'Resend message identifier for the invitation, or null until delivery succeeds.';
COMMENT ON COLUMN exchange.confirmation_email_status IS
  'Current Resend delivery state for the post-acceptance confirmation email.';
COMMENT ON COLUMN exchange.confirmation_email_id IS
  'Resend message identifier for the confirmation, or null until delivery succeeds.';
COMMENT ON COLUMN exchange.created_at IS
  'Timestamp when the exchange was created.';
COMMENT ON COLUMN exchange.updated_at IS
  'Timestamp of the most recent lifecycle or email-delivery update.';

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

/*
 * Relationship summary
 * --------------------
 * user 1 ── * session   (session.user_id → user.id, cascading delete)
 * user 1 ── * account   (account.user_id → user.id, cascading delete)
 * user 1 ── * exchange  (exchange.host_user_id → user.id, restricted delete)
 * user 1 ── * exchange  (exchange.counterpart_user_id → user.id, set-null delete)
 *
 * Exchange identity is hybrid: foreign keys provide ownership and authorization,
 * while names and the invited email remain immutable event-time snapshots.
 * A pending invitation is claimed by matching its email, then authorization
 * switches to counterpart_user_id.
 */
