CREATE TABLE "pending_excerpts" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
