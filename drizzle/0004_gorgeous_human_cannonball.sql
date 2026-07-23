ALTER TYPE "public"."exchange_status" ADD VALUE 'completed';--> statement-breakpoint
CREATE TABLE "meal_check_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checker_user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "meal_check_session_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_check_session" ADD CONSTRAINT "meal_check_session_checker_user_id_user_id_fk" FOREIGN KEY ("checker_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_check_session_checker_user_id_idx" ON "meal_check_session" USING btree ("checker_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_check_session_one_active_per_checker_unique" ON "meal_check_session" USING btree ("checker_user_id") WHERE "meal_check_session"."ended_at" is null;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_meal_check_session_id_meal_check_session_id_fk" FOREIGN KEY ("meal_check_session_id") REFERENCES "public"."meal_check_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_meal_check_session_id_idx" ON "exchange" USING btree ("meal_check_session_id");