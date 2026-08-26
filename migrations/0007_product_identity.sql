CREATE TABLE IF NOT EXISTS product_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'unknown',
  UNIQUE(product_id, alias, language)
);

CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id ON product_aliases(product_id);

INSERT OR IGNORE INTO products (id, canonical_name, watch_category, product_type, language, updated_at) VALUES
  ('ah-en-etb', 'Ascended Heroes Elite Trainer Box', 'ascended_heroes', 'elite_trainer_box', 'english', CURRENT_TIMESTAMP),
  ('ah-en-booster-bundle', 'Ascended Heroes Booster Bundle', 'ascended_heroes', 'booster_bundle', 'english', CURRENT_TIMESTAMP),
  ('ah-en-poster', 'Ascended Heroes Premium Poster Collection', 'ascended_heroes', 'poster_collection', 'english', CURRENT_TIMESTAMP),
  ('ah-en-tech-sticker', 'Ascended Heroes Tech Sticker Collection', 'ascended_heroes', 'tech_sticker_collection', 'english', CURRENT_TIMESTAMP),
  ('ah-en-mega-emboar', 'Ascended Heroes Mega Emboar ex Box', 'ascended_heroes', 'ex_box', 'english', CURRENT_TIMESTAMP),
  ('ah-en-mega-feraligatr', 'Ascended Heroes Mega Feraligatr ex Box', 'ascended_heroes', 'ex_box', 'english', CURRENT_TIMESTAMP),
  ('ah-en-mega-meganium', 'Ascended Heroes Mega Meganium ex Box', 'ascended_heroes', 'ex_box', 'english', CURRENT_TIMESTAMP),
  ('30-en-etb', '30th Celebration Elite Trainer Box', '30th_celebration', 'elite_trainer_box', 'english', CURRENT_TIMESTAMP),
  ('30-en-booster-bundle', '30th Celebration Booster Bundle', '30th_celebration', 'booster_bundle', 'english', CURRENT_TIMESTAMP),
  ('30-en-poster', '30th Celebration Poster Collection', '30th_celebration', 'poster_collection', 'english', CURRENT_TIMESTAMP),
  ('30-en-binder', '30th Celebration Binder Collection', '30th_celebration', 'binder_collection', 'english', CURRENT_TIMESTAMP),
  ('30-en-tech-sticker', '30th Celebration Tech Sticker Collection', '30th_celebration', 'tech_sticker_collection', 'english', CURRENT_TIMESTAMP),
  ('30-en-upc-day', '30th Celebration Ultra-Premium Collection — Day', '30th_celebration', 'ultra_premium_collection', 'english', CURRENT_TIMESTAMP),
  ('30-en-upc-night', '30th Celebration Ultra-Premium Collection — Night', '30th_celebration', 'ultra_premium_collection', 'english', CURRENT_TIMESTAMP);

UPDATE inventory SET product_id = CASE
  WHEN watch_category='ascended_heroes' AND lower(title) LIKE '%elite trainer box%' THEN 'ah-en-etb'
  WHEN watch_category='ascended_heroes' AND lower(title) LIKE '%booster bundle%' THEN 'ah-en-booster-bundle'
  WHEN watch_category='ascended_heroes' AND lower(title) LIKE '%premium poster collection%' THEN 'ah-en-poster'
  WHEN watch_category='ascended_heroes' AND lower(title) LIKE '%tech sticker collection%' THEN 'ah-en-tech-sticker'
  WHEN watch_category='ascended_heroes' AND lower(title) LIKE '%mega emboar ex box%' THEN 'ah-en-mega-emboar'
  WHEN watch_category='ascended_heroes' AND lower(title) LIKE '%mega feraligatr ex box%' THEN 'ah-en-mega-feraligatr'
  WHEN watch_category='ascended_heroes' AND lower(title) LIKE '%mega meganium ex box%' THEN 'ah-en-mega-meganium'
  WHEN watch_category='30th_celebration' AND lower(title) LIKE '%elite trainer box%' THEN '30-en-etb'
  WHEN watch_category='30th_celebration' AND lower(title) LIKE '%booster bundle%' THEN '30-en-booster-bundle'
  WHEN watch_category='30th_celebration' AND lower(title) LIKE '%binder collection%' THEN '30-en-binder'
  WHEN watch_category='30th_celebration' AND lower(title) LIKE '%tech sticker collection%' THEN '30-en-tech-sticker'
  WHEN watch_category='30th_celebration' AND lower(title) LIKE '%poster collection%' THEN '30-en-poster'
  ELSE product_id END
WHERE language='english';
