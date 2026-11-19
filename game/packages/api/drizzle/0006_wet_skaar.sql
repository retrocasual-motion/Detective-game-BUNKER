CREATE TABLE "player_verdicts" (
	"player_id" text PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
