CREATE TABLE "health_profiles" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "height_cm" double precision,
  "birth_year" bigint,
  "goal" varchar(300),
  "allergies" text,
  "dietary_preferences" text,
  "exercise_limitations" text,
  "available_time" varchar(300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "health_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "health_profiles_height_check" CHECK ("height_cm" IS NULL OR ("height_cm" > 0 AND "height_cm" <= 300)),
  CONSTRAINT "health_profiles_birth_year_check" CHECK ("birth_year" IS NULL OR ("birth_year" >= 1900 AND "birth_year" <= 2100))
);
