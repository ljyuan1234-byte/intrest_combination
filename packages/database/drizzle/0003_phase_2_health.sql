CREATE TABLE "health_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "metric" varchar(32) NOT NULL,
  "value_number" double precision,
  "value_text" text,
  "unit" varchar(16) NOT NULL,
  "local_date" varchar(10) NOT NULL,
  "recorded_at" timestamp with time zone NOT NULL,
  "source" varchar(32) DEFAULT 'manual' NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "health_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "health_records_metric_check" CHECK ("metric" IN ('steps', 'sleep', 'water', 'weight', 'exercise', 'diet_note')),
  CONSTRAINT "health_records_date_check" CHECK ("local_date" ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT "health_records_value_shape_check" CHECK (
    ("metric" = 'diet_note' AND "value_text" IS NOT NULL AND "value_number" IS NULL AND "unit" = 'text')
    OR
    ("metric" <> 'diet_note' AND "value_number" IS NOT NULL AND "value_number" >= 0 AND "value_text" IS NULL)
  )
);

CREATE INDEX "health_records_user_metric_date_idx" ON "health_records" USING btree ("user_id", "metric", "local_date");
CREATE INDEX "health_records_user_recorded_at_idx" ON "health_records" USING btree ("user_id", "recorded_at");
