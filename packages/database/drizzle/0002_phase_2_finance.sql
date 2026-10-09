CREATE TABLE "expense_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(60) NOT NULL,
  "color" varchar(7) DEFAULT '#5c83a6' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "expense_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "expense_categories_user_name_unique" UNIQUE("user_id", "name"),
  CONSTRAINT "expense_categories_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) DEFAULT 'CNY' NOT NULL,
  "occurred_on" varchar(10) NOT NULL,
  "category_id" uuid,
  "merchant" varchar(120),
  "note" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE set null,
  CONSTRAINT "expenses_amount_minor_positive_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "expenses_currency_code_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "expenses_occurred_on_iso_date_check" CHECK ("occurred_on" ~ '^\d{4}-\d{2}-\d{2}$')
);

CREATE INDEX "expenses_user_occurred_on_idx" ON "expenses" USING btree ("user_id", "occurred_on");
CREATE INDEX "expenses_user_category_idx" ON "expenses" USING btree ("user_id", "category_id");
