CREATE TYPE "public"."email_delivery_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."exchange_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('lunch', 'dinner');--> statement-breakpoint
CREATE TABLE "exchange" (
	"id" uuid PRIMARY KEY NOT NULL,
	"host_name" text NOT NULL,
	"counterpart_name" text NOT NULL,
	"counterpart_email" text NOT NULL,
	"location" text NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "exchange_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"invitation_token_hash" text NOT NULL,
	"barcode_value" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"invitation_email_status" "email_delivery_status" DEFAULT 'pending' NOT NULL,
	"invitation_email_id" text,
	"confirmation_email_status" "email_delivery_status" DEFAULT 'pending' NOT NULL,
	"confirmation_email_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_invitation_token_hash_unique" ON "exchange" USING btree ("invitation_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_barcode_value_unique" ON "exchange" USING btree ("barcode_value");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_idempotency_key_unique" ON "exchange" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "exchange_counterpart_email_idx" ON "exchange" USING btree ("counterpart_email");