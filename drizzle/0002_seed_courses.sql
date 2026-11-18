INSERT OR IGNORE INTO `users` (`id`,`email`,`name`,`role`,`program`,`language`,`created`) VALUES
  ('teacher-dina-zagirovna','dina.zagirovna@yessenov.local','Дина Загировна','teacher','Yessenov University','ru',1792584000000),
  ('teacher-farida-maratovna','farida.maratovna@yessenov.local','Фарида Маратовна','teacher','Yessenov University','ru',1792584000000),
  ('teacher-zhanat-elubaevna','zhanat.elubaevna@yessenov.local','Жанат Елубаевна','teacher','Yessenov University','ru',1792584000000),
  ('teacher-elena-nikolaevna','elena.nikolaevna@yessenov.local','Елена Николаевна','teacher','Yessenov University','ru',1792584000000);
--> statement-breakpoint
INSERT OR IGNORE INTO `courses` (`id`,`code`,`title`,`description`,`teacher_id`,`semester`,`closes`,`active`,`created`) VALUES
  ('course-ict-2026','ICT101','ИКТ','Информационно-коммуникационные технологии','teacher-zhanat-elubaevna','Fall 2026','2026-12-31',1,1792584000000),
  ('course-german-2026','GER101','Немецкий язык','Практический курс немецкого языка',NULL,'Fall 2026','2026-12-31',1,1792584000001),
  ('course-english-2026','ENG101','Английский язык','Академический английский язык','teacher-dina-zagirovna','Fall 2026','2026-12-31',1,1792584000002),
  ('course-kazakh-2026','KAZ101','Қазақ тілі','Практический курс казахского языка',NULL,'Fall 2026','2026-12-31',1,1792584000003),
  ('course-sociology-2026','SOC101','Социология','Основы социологии и современного общества','teacher-farida-maratovna','Fall 2026','2026-12-31',1,1792584000004),
  ('course-russian-2026','RUS101','Русский язык','Практический курс русского языка',NULL,'Fall 2026','2026-12-31',1,1792584000005),
  ('course-history-kz-2026','HIS101','История Казахстана','История Казахстана: ключевые этапы и события','teacher-elena-nikolaevna','Fall 2026','2026-12-31',1,1792584000006),
  ('course-math-2026','MATH101','Высшая математика','Основы математического анализа и линейной алгебры',NULL,'Fall 2026','2026-12-31',1,1792584000007);
--> statement-breakpoint
UPDATE `courses` SET `teacher_id`='teacher-zhanat-elubaevna' WHERE `code`='ICT101' AND `semester`='Fall 2026';
--> statement-breakpoint
UPDATE `courses` SET `teacher_id`='teacher-dina-zagirovna' WHERE `code`='ENG101' AND `semester`='Fall 2026';
--> statement-breakpoint
UPDATE `courses` SET `teacher_id`='teacher-farida-maratovna' WHERE `code`='SOC101' AND `semester`='Fall 2026';
--> statement-breakpoint
UPDATE `courses` SET `teacher_id`='teacher-elena-nikolaevna' WHERE `code`='HIS101' AND `semester`='Fall 2026';
