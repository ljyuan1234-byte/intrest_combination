ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "sex" varchar(8);
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "weight_kg" double precision;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "target_weight_kg" double precision;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "activity_level" varchar(16) DEFAULT 'medium' NOT NULL;

ALTER TABLE "health_profiles"
  ADD CONSTRAINT "health_profiles_sex_check" CHECK ("sex" IS NULL OR "sex" IN ('male', 'female', 'other'));
ALTER TABLE "health_profiles"
  ADD CONSTRAINT "health_profiles_weight_check" CHECK ("weight_kg" IS NULL OR "weight_kg" > 0);
ALTER TABLE "health_profiles"
  ADD CONSTRAINT "health_profiles_target_weight_check" CHECK ("target_weight_kg" IS NULL OR "target_weight_kg" > 0);
ALTER TABLE "health_profiles"
  ADD CONSTRAINT "health_profiles_activity_level_check" CHECK ("activity_level" IN ('low', 'medium', 'high'));

CREATE TABLE "health_intake_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "local_date" varchar(10) NOT NULL,
  "mode" varchar(16) DEFAULT 'wellness' NOT NULL,
  "raw_text" text NOT NULL,
  "water_ml" integer DEFAULT 0 NOT NULL,
  "total_calories" integer DEFAULT 0 NOT NULL,
  "protein_g" double precision DEFAULT 0 NOT NULL,
  "carbs_g" double precision DEFAULT 0 NOT NULL,
  "fat_g" double precision DEFAULT 0 NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "health_intake_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "health_intake_logs_mode_check" CHECK ("mode" IN ('wellness', 'fat_loss')),
  CONSTRAINT "health_intake_logs_water_check" CHECK ("water_ml" >= 0 AND "water_ml" <= 10000),
  CONSTRAINT "health_intake_logs_calories_check" CHECK ("total_calories" >= 0)
);

CREATE UNIQUE INDEX "health_intake_logs_user_date_unique" ON "health_intake_logs" USING btree ("user_id", "local_date");
CREATE INDEX "health_intake_logs_user_updated_at_idx" ON "health_intake_logs" USING btree ("user_id", "updated_at");
