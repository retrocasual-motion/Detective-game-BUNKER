-- Поэтапная выдача (SD5-A, A-289): дела, начатые до неё, — с вещдоками, без звонка. Иначе у игрока,
-- который уже вскрыл папки, короба «Изъятое» и «Личные вещи» пропали бы со стола до звонка.
INSERT INTO "player_progress" ("player_id", "progress", "portion")
SELECT "player_id", '{"released":[],"seen":[],"fails":{},"ended":false}'::jsonb, 2
FROM "player_state"
ON CONFLICT ("player_id") DO UPDATE SET "portion" = 2;
