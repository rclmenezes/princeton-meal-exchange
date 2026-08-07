import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const mealType = pgEnum("meal_type", ["lunch", "dinner"]);
export const exchangeStatus = pgEnum("exchange_status", [
  "pending",
  "accepted",
  "completed",
]);
export const emailDeliveryStatus = pgEnum("email_delivery_status", [
  "pending",
  "sending",
  "sent",
  "failed",
]);
export const establishmentType = pgEnum("establishment_type", [
  "dining_hall",
  "eating_club",
]);
export const organizationRole = pgEnum("organization_role", [
  "owner",
  "admin",
  "member",
]);
export const rosterAccountType = pgEnum("roster_account_type", [
  "person",
  "shared_meal_checking",
]);
export const rosterIngestOutcome = pgEnum("roster_ingest_outcome", [
  "applied",
  "rejected",
]);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("organization_slug_unique").on(table.slug)],
);

export const establishment = pgTable(
  "establishment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: establishmentType("type").notNull(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    rosterVersion: integer("roster_version").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("establishment_name_unique").on(table.name),
    uniqueIndex("establishment_organization_id_unique").on(
      table.organizationId,
    ),
  ],
);

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("user"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    accountType: rosterAccountType("account_type").notNull().default("person"),
    studentId: text("student_id"),
    graphId: text("graph_id"),
    planCode: text("plan_code"),
    isExchangeEligible: boolean("is_exchange_eligible")
      .notNull()
      .default(false),
    classYear: integer("class_year"),
    homeEstablishmentId: uuid("home_establishment_id").references(
      () => establishment.id,
      { onDelete: "set null" },
    ),
    eligibilityUpdatedAt: timestamp("eligibility_updated_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_email_unique").on(table.email),
    uniqueIndex("user_student_id_unique").on(table.studentId),
    uniqueIndex("user_graph_id_unique").on(table.graphId),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    activeOrganizationId: text("active_organization_id").references(
      () => organization.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("member_organization_id_idx").on(table.organizationId),
    index("member_user_id_idx").on(table.userId),
    uniqueIndex("member_organization_user_unique").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invitation_organization_id_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const rosterEntry = pgTable(
  "roster_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    source: text("source").notNull().default("club"),
    establishmentId: uuid("establishment_id").references(
      () => establishment.id,
      { onDelete: "cascade" },
    ),
    role: organizationRole("role").notNull().default("member"),
    accountType: rosterAccountType("account_type").notNull().default("person"),
    exchangeEligible: boolean("exchange_eligible").notNull().default(false),
    studentId: text("student_id"),
    classYear: integer("class_year"),
    active: boolean("active").notNull().default(true),
    linkedUserId: text("linked_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("roster_entry_email_idx").on(table.email),
    index("roster_entry_establishment_id_idx").on(table.establishmentId),
    index("roster_entry_linked_user_id_idx").on(table.linkedUserId),
    uniqueIndex("roster_entry_active_source_email_unique")
      .on(table.source, table.email)
      .where(sql`${table.active} = true`),
    uniqueIndex("roster_entry_one_active_club_per_email_unique")
      .on(table.email)
      .where(
        sql`${table.active} = true and ${table.establishmentId} is not null`,
      ),
    uniqueIndex("roster_entry_one_active_shared_account_per_club_unique")
      .on(table.establishmentId)
      .where(
        sql`${table.active} = true and ${table.accountType} = 'shared_meal_checking'`,
      ),
  ],
);

export const rosterIngest = pgTable(
  "roster_ingest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uploaderUserId: text("uploader_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishment.id, { onDelete: "restrict" }),
    filename: text("filename").notNull(),
    checksum: text("checksum").notNull(),
    baseRosterVersion: integer("base_roster_version").notNull(),
    addedCount: integer("added_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    removedCount: integer("removed_count").notNull().default(0),
    outcome: rosterIngestOutcome("outcome").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    index("roster_ingest_establishment_created_idx").on(
      table.establishmentId,
      table.createdAt,
    ),
  ],
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sessionId: text("session_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    establishmentId: uuid("establishment_id").references(
      () => establishment.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("admin_audit_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("admin_audit_establishment_created_idx").on(
      table.establishmentId,
      table.createdAt,
    ),
  ],
);

export const accessNotification = pgTable(
  "access_notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    kind: text("kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: emailDeliveryStatus("status").notNull().default("pending"),
    providerId: text("provider_id"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("access_notification_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    index("access_notification_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const mealCheckSession = pgTable(
  "meal_check_session",
  {
    id: uuid("id").primaryKey(),
    checkerUserId: text("checker_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("meal_check_session_checker_user_id_idx").on(table.checkerUserId),
    uniqueIndex("meal_check_session_one_active_per_checker_unique")
      .on(table.checkerUserId)
      .where(sql`${table.endedAt} is null`),
  ],
);

export const exchange = pgTable(
  "exchange",
  {
    id: uuid("id").primaryKey(),
    hostUserId: text("host_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    counterpartUserId: text("counterpart_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    mealHostUserId: text("meal_host_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    mealGuestUserId: text("meal_guest_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    pairKey: text("pair_key").notNull(),
    hostName: text("host_name").notNull(),
    counterpartName: text("counterpart_name").notNull(),
    counterpartEmail: text("counterpart_email").notNull(),
    location: text("location").notNull(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishment.id, { onDelete: "restrict" }),
    mealType: mealType("meal_type").notNull(),
    exchangeDate: date("exchange_date", { mode: "string" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: exchangeStatus("status").notNull().default("pending"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    mealCheckSessionId: uuid("meal_check_session_id").references(
      () => mealCheckSession.id,
      { onDelete: "set null" },
    ),
    invitationTokenHash: text("invitation_token_hash").notNull(),
    barcodeValue: text("barcode_value").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    invitationEmailStatus: emailDeliveryStatus("invitation_email_status")
      .notNull()
      .default("pending"),
    invitationEmailId: text("invitation_email_id"),
    confirmationEmailStatus: emailDeliveryStatus("confirmation_email_status")
      .notNull()
      .default("pending"),
    confirmationEmailId: text("confirmation_email_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("exchange_invitation_token_hash_unique").on(
      table.invitationTokenHash,
    ),
    uniqueIndex("exchange_barcode_value_unique").on(table.barcodeValue),
    uniqueIndex("exchange_host_idempotency_key_unique").on(
      table.hostUserId,
      table.idempotencyKey,
    ),
    index("exchange_counterpart_user_id_idx").on(table.counterpartUserId),
    index("exchange_counterpart_email_idx").on(table.counterpartEmail),
    index("exchange_meal_check_session_id_idx").on(table.mealCheckSessionId),
    index("exchange_date_establishment_idx").on(
      table.exchangeDate,
      table.establishmentId,
    ),
    uniqueIndex("exchange_pair_meal_unique").on(
      table.pairKey,
      table.exchangeDate,
      table.mealType,
      table.establishmentId,
    ),
  ],
);

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  organizationMemberships: many(member),
  rosterEntries: many(rosterEntry),
  hostedExchanges: many(exchange, { relationName: "exchangeHost" }),
  counterpartExchanges: many(exchange, {
    relationName: "exchangeCounterpart",
  }),
  mealCheckSessions: many(mealCheckSession),
  homeEstablishment: one(establishment, {
    fields: [user.homeEstablishmentId],
    references: [establishment.id],
  }),
}));

export const exchangeRelations = relations(exchange, ({ one }) => ({
  hostUser: one(user, {
    fields: [exchange.hostUserId],
    references: [user.id],
    relationName: "exchangeHost",
  }),
  counterpartUser: one(user, {
    fields: [exchange.counterpartUserId],
    references: [user.id],
    relationName: "exchangeCounterpart",
  }),
  mealHostUser: one(user, {
    fields: [exchange.mealHostUserId],
    references: [user.id],
    relationName: "exchangeMealHost",
  }),
  mealGuestUser: one(user, {
    fields: [exchange.mealGuestUserId],
    references: [user.id],
    relationName: "exchangeMealGuest",
  }),
  establishment: one(establishment, {
    fields: [exchange.establishmentId],
    references: [establishment.id],
  }),
  mealCheckSession: one(mealCheckSession, {
    fields: [exchange.mealCheckSessionId],
    references: [mealCheckSession.id],
  }),
}));

export const establishmentRelations = relations(
  establishment,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [establishment.organizationId],
      references: [organization.id],
    }),
    members: many(user),
    exchanges: many(exchange),
    rosterEntries: many(rosterEntry),
    rosterIngests: many(rosterIngest),
  }),
);

export const mealCheckSessionRelations = relations(
  mealCheckSession,
  ({ one, many }) => ({
    checkerUser: one(user, {
      fields: [mealCheckSession.checkerUserId],
      references: [user.id],
    }),
    exchanges: many(exchange),
  }),
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const rosterEntryRelations = relations(rosterEntry, ({ one }) => ({
  establishment: one(establishment, {
    fields: [rosterEntry.establishmentId],
    references: [establishment.id],
  }),
  linkedUser: one(user, {
    fields: [rosterEntry.linkedUserId],
    references: [user.id],
  }),
}));

export const rosterIngestRelations = relations(rosterIngest, ({ one }) => ({
  uploader: one(user, {
    fields: [rosterIngest.uploaderUserId],
    references: [user.id],
  }),
  establishment: one(establishment, {
    fields: [rosterIngest.establishmentId],
    references: [establishment.id],
  }),
}));
