import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
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

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    studentId: text("student_id"),
    graphId: text("graph_id"),
    planCode: text("plan_code"),
    isExchangeEligible: boolean("is_exchange_eligible")
      .notNull()
      .default(false),
    classYear: integer("class_year"),
    homeEstablishmentId: uuid("home_establishment_id").references(
      () => establishment.id,
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

export const establishment = pgTable(
  "establishment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: establishmentType("type").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("establishment_name_unique").on(table.name)],
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
    mealGuestUserId: text("meal_guest_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
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

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  hostedExchanges: many(exchange, { relationName: "exchangeHost" }),
  counterpartExchanges: many(exchange, {
    relationName: "exchangeCounterpart",
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
}));

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
