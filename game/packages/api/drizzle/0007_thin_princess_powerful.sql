-- A-272: итог заключения переезжает из таблицы писем-ответов в player_verdicts, затем письма снимаются.
INSERT INTO "player_verdicts" ("player_id", "result", "sent_at")
SELECT DISTINCT ON ("player_id") "player_id", "body"::jsonb, "sent_at" FROM "player_letters"
WHERE "title" = '__verdict' ORDER BY "player_id", "n" DESC
ON CONFLICT ("player_id") DO NOTHING;--> statement-breakpoint
DROP TABLE "player_letters" CASCADE;--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "mail_channel";