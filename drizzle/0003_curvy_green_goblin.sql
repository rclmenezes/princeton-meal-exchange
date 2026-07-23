DROP INDEX "exchange_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "host_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange" ADD COLUMN "counterpart_user_id" text;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_host_user_id_user_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_counterpart_user_id_user_id_fk" FOREIGN KEY ("counterpart_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_host_idempotency_key_unique" ON "exchange" USING btree ("host_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "exchange_counterpart_user_id_idx" ON "exchange" USING btree ("counterpart_user_id");
