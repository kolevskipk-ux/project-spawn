CREATE TABLE IF NOT EXISTS amazon_watchlist (
  asin TEXT PRIMARY KEY CHECK(length(asin)=10),
  product_name TEXT NOT NULL,
  product_url TEXT NOT NULL,
  watch_category TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'unknown',
  priority TEXT NOT NULL DEFAULT 'HIGH' CHECK(priority IN ('BOSS','HIGH','NORMAL')),
  lane TEXT NOT NULL DEFAULT 'normal' CHECK(lane IN ('priority','normal')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED')),
  source TEXT NOT NULL,
  first_discovered_at TEXT NOT NULL,
  last_discovered_at TEXT NOT NULL,
  UNIQUE(product_url)
);

CREATE INDEX IF NOT EXISTS idx_amazon_watchlist_schedule ON amazon_watchlist(status, lane, priority);

INSERT OR IGNORE INTO amazon_watchlist
  (asin,product_name,product_url,watch_category,language,priority,lane,status,source,first_discovered_at,last_discovered_at)
VALUES
  ('B0H77VYKSM','30th Celebration Ultra-Premium Collection — Day','https://www.amazon.com.mx/dp/B0H77VYKSM','30th_celebration','english','BOSS','priority','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H77XNKKK','30th Celebration Ultra-Premium Collection — Night','https://www.amazon.com.mx/dp/B0H77XNKKK','30th_celebration','english','BOSS','priority','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H784PD4X','30th Celebration Ultra-Premium Collection — Day or Night','https://www.amazon.com.mx/dp/B0H784PD4X','30th_celebration','english','BOSS','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H78BB9TY','30th Celebration Elite Trainer Box','https://www.amazon.com.mx/dp/B0H78BB9TY','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H783FY5Z','30th Celebration Booster Bundle','https://www.amazon.com.mx/dp/B0H783FY5Z','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H77W4411','30th Celebration Poster Collection','https://www.amazon.com.mx/dp/B0H77W4411','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H7818YHY','30th Celebration Binder Collection','https://www.amazon.com.mx/dp/B0H7818YHY','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H784PJ49','30th Celebration Sylveon ex or Greninja ex Tin','https://www.amazon.com.mx/dp/B0H784PJ49','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H77XCW4M','30th Celebration Figure Collection — Mew','https://www.amazon.com.mx/dp/B0H77XCW4M','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H786SFFS','30th Celebration Figure Collection — Mewtwo','https://www.amazon.com.mx/dp/B0H786SFFS','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H77VZBX4','30th Celebration Tech Sticker Collection','https://www.amazon.com.mx/dp/B0H77VZBX4','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H786LQ7Z','30th Celebration Mini Tin — Pikachu (Night)','https://www.amazon.com.mx/dp/B0H786LQ7Z','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H7817G9M','30th Celebration Sylveon ex Box','https://www.amazon.com.mx/dp/B0H7817G9M','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('B0H786RZD9','30th Celebration Battle Deck — Umbreon ex','https://www.amazon.com.mx/dp/B0H786RZD9','30th_celebration','english','HIGH','normal','ACTIVE','catch_import',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
