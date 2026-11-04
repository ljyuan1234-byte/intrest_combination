CREATE TABLE "llm_usage_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "local_date" varchar(10) NOT NULL,
  "model" varchar(120) NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "llm_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "llm_usage_logs_tokens_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0 AND "total_tokens" >= 0)
);

CREATE INDEX "llm_usage_logs_user_date_idx" ON "llm_usage_logs" USING btree ("user_id", "local_date");
CREATE INDEX "llm_usage_logs_created_at_idx" ON "llm_usage_logs" USING btree ("created_at");
