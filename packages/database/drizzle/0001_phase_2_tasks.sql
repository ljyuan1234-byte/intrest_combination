CREATE TABLE "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" varchar(200) NOT NULL,
  "status" varchar(16) DEFAULT 'todo' NOT NULL,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "tasks_status_check" CHECK ("status" IN ('todo', 'done', 'cancelled'))
);

CREATE INDEX "tasks_user_id_status_idx" ON "tasks" USING btree ("user_id", "status");
CREATE INDEX "tasks_user_id_due_at_idx" ON "tasks" USING btree ("user_id", "due_at");

CREATE TABLE "idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "scope" varchar(100) NOT NULL,
  "key" varchar(200) NOT NULL,
  "response_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "idempotency_keys_user_scope_key_unique" UNIQUE("user_id", "scope", "key")
);

CREATE INDEX "idempotency_keys_user_id_created_at_idx" ON "idempotency_keys" USING btree ("user_id", "created_at");
