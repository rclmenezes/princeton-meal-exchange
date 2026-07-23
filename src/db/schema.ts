import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
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

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)],
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
  },
  (table) => [uniqueIndex("session_token_unique").on(table.token)],
);

export const account = pgTable("account", {
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
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

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
    hostName: text("host_name").notNull(),
    counterpartName: text("counterpart_name").notNull(),
    counterpartEmail: text("counterpart_email").notNull(),
    location: text("location").notNull(),
    mealType: mealType("meal_type").notNull(),
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
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  hostedExchanges: many(exchange, { relationName: "exchangeHost" }),
  counterpartExchanges: many(exchange, {
    relationName: "exchangeCounterpart",
  }),
  mealCheckSessions: many(mealCheckSession),
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
  mealCheckSession: one(mealCheckSession, {
    fields: [exchange.mealCheckSessionId],
    references: [mealCheckSession.id],
  }),
}));

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
