CREATE TABLE "calendar_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" varchar(200) NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone,
  "notes" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "calendar_events_time_range_check" CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at")
);

CREATE INDEX "calendar_events_user_starts_at_idx" ON "calendar_events" USING btree ("user_id", "starts_at");

CREATE TABLE "reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "event_id" uuid,
  "title" varchar(200) NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "idempotency_key" varchar(200),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "reminders_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE cascade,
  CONSTRAINT "reminders_status_check" CHECK ("status" IN ('pending', 'cancelled')),
  CONSTRAINT "reminders_user_idempotency_key_unique" UNIQUE("user_id", "idempotency_key")
);

CREATE INDEX "reminders_user_scheduled_at_idx" ON "reminders" USING btree ("user_id", "scheduled_at");
