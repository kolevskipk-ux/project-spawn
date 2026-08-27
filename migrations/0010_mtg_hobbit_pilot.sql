INSERT OR IGNORE INTO products (id, canonical_name, watch_category, product_type, language, updated_at) VALUES
  ('mtg-hobbit-en-collector-booster-box', 'Magic: The Gathering | The Hobbit Collector Booster Box', 'mtg_hobbit_collector_box', 'collector_booster_box', 'english', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO product_aliases (product_id, alias, language) VALUES
  ('mtg-hobbit-en-collector-booster-box', 'The Hobbit Collector Booster Box', 'english'),
  ('mtg-hobbit-en-collector-booster-box', 'Hobbit Collector Booster Box', 'english'),
  ('mtg-hobbit-en-collector-booster-box', 'The Hobbit Collector Booster Display', 'english'),
  ('mtg-hobbit-en-collector-booster-box', 'Hobbit Collector Booster Display', 'english'),
  ('mtg-hobbit-en-collector-booster-box', 'MTG Hobbit Collector Booster Box', 'english'),
  ('mtg-hobbit-en-collector-booster-box', 'Magic: The Gathering | The Hobbit Collector Booster Box', 'english');

PRAGMA optimize;
