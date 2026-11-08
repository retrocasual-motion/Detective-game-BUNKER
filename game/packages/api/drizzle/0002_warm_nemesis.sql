CREATE TABLE "player_progress" (
	"player_id" text PRIMARY KEY NOT NULL,
	"progress" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
