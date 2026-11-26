CREATE TABLE "player_state_backups" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "player_state_backups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"player_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"dropped" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_state" ADD COLUMN "writer" text DEFAULT '' NOT NULL;