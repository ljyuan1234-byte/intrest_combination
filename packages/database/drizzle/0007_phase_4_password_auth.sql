ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;

CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" USING btree ("phone") WHERE "phone" IS NOT NULL;

ALTER TABLE "users"
  ADD CONSTRAINT "users_identifier_check" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_format_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');
