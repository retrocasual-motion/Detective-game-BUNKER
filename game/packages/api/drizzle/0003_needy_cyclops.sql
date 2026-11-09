CREATE TABLE "player_letters" (
	"player_id" text NOT NULL,
	"n" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"released" jsonb NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"deliver_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_letters_player_id_n_pk" PRIMARY KEY("player_id","n")
);
