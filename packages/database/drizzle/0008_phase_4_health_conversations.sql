CREATE TABLE "health_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "mode" varchar(16) DEFAULT 'wellness' NOT NULL,
  "title" varchar(200) DEFAULT '健康对话' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "health_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "health_conversations_mode_check" CHECK ("mode" IN ('wellness', 'fat_loss'))
);

CREATE INDEX "health_conversations_user_updated_at_idx" ON "health_conversations" USING btree ("user_id", "updated_at");

CREATE TABLE "health_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" varchar(16) NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "health_messages_conversation_id_health_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "health_conversations"("id") ON DELETE cascade,
  CONSTRAINT "health_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "health_messages_role_check" CHECK ("role" IN ('user', 'assistant', 'tool', 'system'))
);

CREATE INDEX "health_messages_conversation_created_at_idx" ON "health_messages" USING btree ("conversation_id", "created_at");
CREATE INDEX "health_messages_user_created_at_idx" ON "health_messages" USING btree ("user_id", "created_at");

CREATE TABLE "health_memory_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "message_id" uuid,
  "content" text NOT NULL,
  "keywords" text DEFAULT '' NOT NULL,
  "embedding" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "health_memory_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "health_memory_chunks_conversation_id_health_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "health_conversations"("id") ON DELETE cascade,
  CONSTRAINT "health_memory_chunks_message_id_health_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "health_messages"("id") ON DELETE cascade
);

CREATE INDEX "health_memory_chunks_user_created_at_idx" ON "health_memory_chunks" USING btree ("user_id", "created_at");
