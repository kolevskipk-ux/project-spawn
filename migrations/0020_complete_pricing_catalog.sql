-- Every published Amazon identity must have a canonical product row so pricing
-- coverage cannot silently exclude hunted products from its denominator.
INSERT OR IGNORE INTO products
  (id, canonical_name, watch_category, product_type, language, updated_at)
VALUES
  ('30-en-upc-random', '30th Celebration Ultra-Premium Collection — Day or Night', '30th_celebration', 'ultra_premium_collection', 'english', CURRENT_TIMESTAMP),
  ('30-en-tin', '30th Celebration Sylveon ex or Greninja ex Tin', '30th_celebration', 'tin', 'english', CURRENT_TIMESTAMP),
  ('30-en-figure-mew', '30th Celebration Figure Collection — Mew', '30th_celebration', 'figure_collection', 'english', CURRENT_TIMESTAMP),
  ('30-en-figure-mewtwo', '30th Celebration Figure Collection — Mewtwo', '30th_celebration', 'figure_collection', 'english', CURRENT_TIMESTAMP),
  ('30-en-mini-tin-night', '30th Celebration Mini Tin — Pikachu (Night)', '30th_celebration', 'mini_tin', 'english', CURRENT_TIMESTAMP),
  ('30-en-sylveon-box', '30th Celebration Sylveon ex Box', '30th_celebration', 'ex_box', 'english', CURRENT_TIMESTAMP),
  ('30-en-umbreon-deck', '30th Celebration Battle Deck — Umbreon ex', '30th_celebration', 'battle_deck', 'english', CURRENT_TIMESTAMP),
  ('delta-reign-en-etb', 'Delta Reign Elite Trainer Box', 'delta_reign', 'elite_trainer_box', 'english', CURRENT_TIMESTAMP),
  ('delta-reign-en-booster-bundle', 'Delta Reign Booster Bundle', 'delta_reign', 'booster_bundle', 'english', CURRENT_TIMESTAMP),
  ('delta-reign-en-three-booster-blister', 'Delta Reign Three Booster Blister', 'delta_reign', 'three_booster_blister', 'english', CURRENT_TIMESTAMP),
  ('delta-reign-en-build-battle-box', 'Delta Reign Build & Battle Box', 'delta_reign', 'build_battle_box', 'english', CURRENT_TIMESTAMP);

PRAGMA optimize;
