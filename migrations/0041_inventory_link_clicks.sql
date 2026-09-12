CREATE TABLE outbound_links (
  id TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  retailer TEXT NOT NULL,
  product TEXT NOT NULL,
  source TEXT NOT NULL,
  route TEXT NOT NULL,
  kind TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE outbound_click_days (
  link_id TEXT NOT NULL REFERENCES outbound_links(id),
  day TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('filtered_click','automated','unclassified')),
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(link_id,day,category)
);
CREATE INDEX outbound_click_days_day ON outbound_click_days(day);
