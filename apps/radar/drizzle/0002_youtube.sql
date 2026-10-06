-- Turn YouTube on for the AI liability topic with searches and channels tested against real
-- results. Topics that already have YouTube settings keep them.
UPDATE "topics" SET "config" = jsonb_set("config", '{queries,youtube}', '{"search": ["\"AI liability\" insurance", "\"AI exclusions\" insurance", "\"silent AI\" OR \"affirmative AI\" insurance"], "channels": ["https://www.youtube.com/channel/UCcXFMZ7LQas6Uf0Pmy5opfA", "https://www.youtube.com/channel/UCzTi0B_BHft1O4hmM8_ehoQ", "https://www.youtube.com/channel/UCytvKBacFpNKk9sVZXUw1kA"]}'::jsonb, true)
WHERE "slug" = 'ai-liability-insurance' AND NOT (("config"->'queries') ? 'youtube');
