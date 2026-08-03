CREATE TYPE "public"."establishment_type" AS ENUM('dining_hall', 'eating_club');--> statement-breakpoint
CREATE TABLE "establishment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "establishment_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "meal_host_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "meal_guest_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "pair_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "establishment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "exchange_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "student_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "graph_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "plan_code" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_exchange_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "class_year" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "home_establishment_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "eligibility_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "establishment_name_unique" ON "establishment" USING btree ("name");--> statement-breakpoint
INSERT INTO "establishment" ("name", "type", "is_active") VALUES
	('Butler College', 'dining_hall', true),
	('Center for Jewish Life', 'dining_hall', true),
	('Forbes College', 'dining_hall', true),
	('Graduate College', 'dining_hall', true),
	('Huo College', 'dining_hall', true),
	('Mathey College', 'dining_hall', true),
	('Rockefeller College', 'dining_hall', true),
	('Whitman College', 'dining_hall', true),
	('Yeh College', 'dining_hall', true),
	('Cannon Club', 'eating_club', true),
	('Cap and Gown Club', 'eating_club', true),
	('Tower Club', 'eating_club', true),
	('Ivy Club', 'eating_club', true),
	('Tiger Inn', 'eating_club', true),
	('Cottage Club', 'eating_club', true),
	('Charter Club', 'eating_club', true),
	('Cloister Inn', 'eating_club', true),
	('Colonial Club', 'eating_club', true),
	('Quadrangle Club', 'eating_club', true),
	('Terrace Club', 'eating_club', true)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_meal_host_user_id_user_id_fk" FOREIGN KEY ("meal_host_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_meal_guest_user_id_user_id_fk" FOREIGN KEY ("meal_guest_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_establishment_id_establishment_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_home_establishment_id_establishment_id_fk" FOREIGN KEY ("home_establishment_id") REFERENCES "public"."establishment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_date_establishment_idx" ON "exchange" USING btree ("exchange_date","establishment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_pair_meal_unique" ON "exchange" USING btree ("pair_key","exchange_date","meal_type","establishment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_student_id_unique" ON "user" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_graph_id_unique" ON "user" USING btree ("graph_id");
